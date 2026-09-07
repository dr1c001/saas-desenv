"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomUUID } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { retryOnUniqueConflict } from "@/lib/retry"
import { lerDinheiro } from "@/lib/dinheiro"
// Compartilhada com actions/os-orcamento.ts: um arquivo "use server" so pode
// exportar Server Action, entao a contagem mora num lib.
import { proximoNumeroDeOrcamento } from "@/lib/orcamento-db"
import { problemaNoEnvio, textoDoOrcamento } from "@/lib/envio-documento"
import { sendQuoteEmail } from "@/lib/resend"
import { emailDaEmpresa, numeroDoOrcamento, urlPublica } from "@/lib/envio-db"

// As mensagens do zod são códigos estáveis, não frases prontas: quem monta o
// texto é o formulário, via next-intl, no idioma do usuário. O schema é módulo
// (sem acesso a hook/request), então traduzir aqui obrigaria a resolver locale
// dentro da action. (Mesmo padrão de actions/auth.ts — i18n, item 1.)
const quoteSchema = z.object({
  // O cliente CADASTRADO. Passou a ser obrigatorio em 05/09/2026: "para fazer
  // o orcamento, precisa cadastrar o cliente na aba cliente".
  //
  // Nome, endereco e contato deixaram de ser digitados — sao COPIADOS do
  // cadastro na hora de gravar, e viram o retrato do cliente naquele dia.
  clientId: z.string().min(1, "clientRequired"),
  description: z.string().min(3, "descriptionRequired"),
  materials: z.string().optional(),
  amount: z.string().optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]).default("DRAFT"),
})

/** O que a tela mostra depois de clicar em enviar. */
export type EstadoDeEnvio = { erro?: string; ok?: boolean; destino?: string }

export type QuoteFormState = {
  // Valores são chaves de quotes.validation.*, resolvidas no formulário.
  errors?: Record<string, string[]>
  messageCode?: "NO_PERMISSION"
}

// "1.234,56" (formato BR, o mesmo do placeholder "0,00" do campo) —
// replace(",", ".") sozinho vira "1.234.56", e parseFloat para no segundo
// ponto e devolve 1.234 em vez de 1234.56. Remove primeiro o separador de
// milhar, só depois troca a vírgula decimal pelo ponto.
// (Achado verificando o sistema antes da primeira venda, 2026-07-28.)
// A leitura virou lib/dinheiro.ts, compartilhada. Esta era a QUARTA cópia da
// mesma linha no projeto, e é assim que a quinta nasce errada — foi o que
// aconteceu no estoque e no patrimônio, onde a mesma regra lia "12.5" como 125.
// Aqui nunca deu problema porque o formulário já formatava com vírgula.
function parseBrCurrency(value: string): number {
  return lerDinheiro(value) ?? 0
}

/**
 * O retrato do cliente no dia do orcamento.
 *
 * Copia de Client para as colunas de texto do Quote. Nao e redundancia: o
 * orcamento e um documento que sai da empresa, e mudar o endereco do cliente em
 * novembro nao pode reescrever o papel enviado em setembro. E e o que mantem as
 * seis telas e o PDF funcionando sem join.
 *
 * `null` quando o cliente nao e desta empresa — a Action e endereco HTTP, e um
 * clientId de fora emitiria orcamento com os dados de outra base.
 */
async function retratoDoCliente(tenantId: string, clientId: string) {
  const c = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      whatsapp: true,
      email: true,
      address: { select: { street: true, number: true, district: true, city: true, state: true } },
    },
  })
  if (!c) return null

  // Mesma montagem de endereco e de contato que gerarOrcamentoDaOs ja usa
  // (actions/os-orcamento.ts): dois caminhos criam orcamento, e escrever o
  // endereco de dois jeitos faria o mesmo cliente sair diferente em cada um.
  const e = c.address
  const endereco = e
    ? [e.street, e.number, e.district, e.city, e.state].filter(Boolean).join(", ")
    : null

  return {
    clientId: c.id,
    clientName: c.name,
    clientAddress: endereco || null,
    // O e-mail do ENVIO nao sai daqui: sai de Client.email, lido na hora de
    // enviar. Este campo e o "Contato" impresso no PDF.
    clientContact: c.whatsapp || c.phone || c.email || null,
  }
}

/**
 * Os clientes que podem receber um orcamento.
 *
 * Lista leve — id, nome e se tem e-mail. O e-mail vem junto para o formulario
 * poder AVISAR na hora da escolha que aquele cliente nao vai poder receber o
 * orcamento por e-mail: descobrir isso so no clique de enviar seria descobrir
 * tarde.
 *
 * Inativos ficam de fora: orcamento e proposta nova, e propor servico a quem
 * foi arquivado e engano com cara de acerto.
 */
export async function clientesParaOrcamento() {
  const { tenantId } = await getTenant()
  return prisma.client.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
}

export async function createQuote(
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const { tenantId, role, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { messageCode: "NO_PERMISSION" }
  const raw = Object.fromEntries(formData.entries())
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { clientId, description, materials, amount, notes, validUntil, status } = parsed.data

  const cliente = await retratoDoCliente(tenantId, clientId)
  if (!cliente) return { errors: { clientId: ["clientNotFound"] } }

  // A contagem sem lock e o retry estão explicados em lib/orcamento-db.ts,
  // junto da função. (Achado em auditoria pré-venda, 2026-08-05.)
  await retryOnUniqueConflict(async () => {
    const number = await proximoNumeroDeOrcamento(tenantId)
    return prisma.quote.create({
      data: {
        number,
        tenantId,
        // Quem emitiu, para a assinatura CERTA sair no PDF. Sem isto só daria
        // para carimbar quem está BAIXANDO o documento — e um administrador
        // baixando o orçamento da Ana sairia com a assinatura dele.
        createdById: userId,
        ...cliente,
        description,
        materials: materials || null,
        amount: amount ? parseBrCurrency(amount) : 0,
        notes: notes || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status,
        // @default(uuid()) do schema não está de fato aplicado na coluna do
        // banco (drift confirmado via information_schema — column_default
        // nulo) — sem gerar aqui, clientToken ficava sempre nulo, quebrando a
        // aprovação online do orçamento pelo cliente (depende desse token no
        // link público /q/[token]). (Achado verificando o sistema de NPS,
        // 2026-07-22.)
        clientToken: randomUUID(),
      },
    })
  })

  revalidatePath("/quotes")
  redirect("/quotes")
}

export async function updateQuote(
  id: string,
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { messageCode: "NO_PERMISSION" }
  const raw = Object.fromEntries(formData.entries())
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { clientId, description, materials, amount, notes, validUntil, status } = parsed.data

  const cliente = await retratoDoCliente(tenantId, clientId)
  if (!cliente) return { errors: { clientId: ["clientNotFound"] } }

  await prisma.quote.update({
    where: { id, tenantId },
    data: {
      ...cliente,
      description,
      materials: materials || null,
      amount: amount ? parseBrCurrency(amount) : 0,
      notes: notes || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      status,
    },
  })

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  redirect(`/quotes/${id}`)
}

export async function updateQuoteStatus(id: string, status: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  const valid = ["DRAFT", "SENT", "APPROVED", "REJECTED"]
  if (!valid.includes(status)) return
  await prisma.quote.update({ where: { id, tenantId }, data: { status: status as never } })
  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
}

export async function deleteQuote(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  await prisma.quote.delete({ where: { id, tenantId } })
  revalidatePath("/quotes")
  redirect("/quotes")
}

export async function getQuotes(filters?: { q?: string; status?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.quote.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.q
        ? {
            OR: [
              { clientName: { contains: filters.q, mode: "insensitive" } },
              { description: { contains: filters.q, mode: "insensitive" } },
              { clientContact: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getQuote(id: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.quote.findUnique({ where: { id, tenantId } })
}

/**
 * Manda o orçamento para o e-mail do cliente cadastrado.
 *
 * ─── O que vai no e-mail ─────────────────────────────────────────────────────
 *
 * O LINK da página pública, e não o PDF anexo. A página mostra o orçamento
 * inteiro E tem os botões de aprovar e recusar — que é para o que o e-mail
 * existe. Anexar o PDF exigiria extrair a renderização de dentro da rota HTTP
 * (que autentica por cookie de sessão) e mandaria dezenas de megabytes quando o
 * orçamento tem fotos, que o documento embute em base64.
 *
 * ─── Para onde vai a RESPOSTA ────────────────────────────────────────────────
 *
 * Para o e-mail do dono da empresa, e não para o suporte do ServiçoOS. Todo
 * e-mail "em nome da empresa" tinha `replyTo` fixo no nosso suporte, o que
 * estava certo para aviso automático de status — não há o que responder — e
 * está errado aqui: o cliente responde "pode fazer, quando vocês vêm?", e essa
 * mensagem precisa chegar em quem vai fazer.
 */
export async function enviarOrcamentoPorEmail(id: string): Promise<EstadoDeEnvio> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Manda documento comercial em nome da empresa para um terceiro. Não é
  // gesto de técnico em campo.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      number: true,
      createdAt: true,
      validUntil: true,
      clientName: true,
      clientToken: true,
      status: true,
      sentAt: true,
      client: { select: { email: true, name: true } },
      tenant: { select: { name: true, locale: true } },
    },
  })
  if (!quote) return { erro: "naoEncontrado" }

  const problema = problemaNoEnvio({
    email: quote.client?.email,
    token: quote.clientToken,
    enviadoEm: quote.sentAt,
    agora: new Date(),
  })
  if (problema) return { erro: problema }

  const destino = quote.client!.email!.trim()
  const numero = numeroDoOrcamento(quote.number, quote.createdAt)
  const texto = textoDoOrcamento({
    empresa: quote.tenant.name,
    numero,
    cliente: quote.client?.name ?? quote.clientName,
    validade: quote.validUntil,
    link: `${urlPublica()}/q/${quote.clientToken}`,
  })

  try {
    await sendQuoteEmail(destino, quote.tenant.name, numero, texto, await emailDaEmpresa(tenantId))
  } catch {
    // O erro do provedor não sobe cru para a tela: ele fala inglês e cita
    // domínio não verificado. Mas TAMBÉM não pode virar silêncio — quem
    // clicou precisa saber que não saiu.
    return { erro: "falhaNoEnvio" }
  }

  // Gravado DEPOIS de enviar, e não antes: o molde do NPS, e não o da régua de
  // cobrança. A régua grava antes de propósito, para a régua andar mesmo sem a
  // mensagem sair; aqui é o contrário — marcar "enviado" um e-mail que não saiu
  // faria a tela mentir para quem está esperando o cliente responder.
  await prisma.quote.update({
    where: { id },
    data: {
      sentAt: new Date(),
      sentTo: destino,
      // Um orçamento que foi para o cliente não é mais rascunho. A página
      // pública já aceitava resposta em DRAFT, mas a LISTA do dono mostrava
      // "rascunho" para algo que o cliente já tinha na mão.
      ...(quote.status === "DRAFT" ? { status: "SENT" as const } : {}),
    },
  })

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  return { ok: true, destino }
}
