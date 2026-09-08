"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { documentoAceitavel, somenteDigitos } from "@/lib/documento"
import { lerDinheiro } from "@/lib/dinheiro"

// Os FORNECEDORES — quem vende peça e material para a empresa.
//
// Não confundir com PRESTADOR (`actions/providers.ts`), que presta serviço PARA
// ela: manutenção, elétrica, terceirizado. São dois cadastros de propósito, e
// misturá-los faria a lista de quem cotar peça vir cheia de eletricista.
//
// Toda export aqui é endereço HTTP despachável, e cada uma refaz as checagens
// por conta própria — esconder o botão na tela não protege nada.
//
// ─── Por que este arquivo, e não `actions/compras.ts` ───────────────────────
//
// O fornecedor morava lá porque só existia dentro da tela de Compras. Agora ele
// tem tela própria, é usado por compra E por cotação, e tem ciclo de vida
// próprio (ativo/inativo). Deixá-lo em compras faria a tela de fornecedor
// depender do módulo de compras para existir.

export type EstadoFornecedor = { erro?: string; ok?: boolean; id?: string; aviso?: string }

const ehAdmin = (role: string) => role === "OWNER" || role === "ADMIN"

async function contexto() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  return { tenantId, role }
}

/** Texto do formulário: corta no limite e vira null quando vazio. */
const texto = (v: FormDataEntryValue | null, max = 120) =>
  String(v ?? "").trim().slice(0, max) || null

export async function getFornecedores(filtros?: { q?: string; situacao?: string }) {
  const { tenantId } = await getTenant()
  const q = filtros?.q?.trim()
  // A busca por documento só entra quando há DÍGITO no que foi digitado.
  // Procurar "frio" nos dígitos do CNPJ não tem sentido, e um filtro vazio ali
  // casaria com todo fornecedor que tem documento.
  const digitos = q ? somenteDigitos(q) : ""

  return prisma.supplier.findMany({
    where: {
      tenantId,
      ...(filtros?.situacao === "ATIVO"
        ? { active: true }
        : filtros?.situacao === "INATIVO"
          ? { active: false }
          : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { legalName: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
              { contactName: { contains: q, mode: "insensitive" as const } },
              { city: { contains: q, mode: "insensitive" as const } },
              // Casa pelos DÍGITOS: quem digita "11222333" não deve depender de
              // acertar a pontuação do CNPJ.
              ...(digitos ? [{ documentDigits: { contains: digitos } }] : []),
            ],
          }
        : {}),
    },
    include: { _count: { select: { purchaseOrders: true, quotations: true } } },
    // Ativos primeiro; dentro deles, ordem alfabética, que é como se procura.
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 300,
  })
}

/** Só os ativos, para os campos de escolha de compra e cotação. */
export async function getFornecedoresAtivos() {
  const { tenantId } = await getTenant()
  return prisma.supplier.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getFornecedor(id: string) {
  const { tenantId } = await getTenant()
  return prisma.supplier.findFirst({
    where: { id, tenantId },
    include: {
      purchaseOrders: {
        select: { id: true, number: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      quotations: {
        select: {
          id: true,
          respondedAt: true,
          quotation: { select: { id: true, number: true, title: true, status: true } },
        },
        orderBy: { id: "desc" },
        take: 20,
      },
    },
  })
}

export async function salvarFornecedor(
  id: string | null,
  _prev: EstadoFornecedor,
  formData: FormData
): Promise<EstadoFornecedor> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const name = texto(formData.get("name"))
  if (!name || name.length < 2) return { erro: "nomeObrigatorio" }

  // Documento VAZIO passa: fornecedor sem CNPJ é cadastro legítimo. O que se
  // recusa é o preenchido que não fecha — pior que em branco, porque parece
  // certo e vai parar no boleto e na nota. Regra em lib/documento.ts.
  const document = texto(formData.get("document"), 20)
  if (!documentoAceitavel(document)) return { erro: "documentoInvalido" }
  const documentDigits = somenteDigitos(document) || null

  // Prazo de entrega em dias inteiros. Negativo não existe; vazio é null.
  const prazoCru = lerDinheiro(formData.get("leadTimeDays"))
  const leadTimeDays =
    prazoCru !== null && prazoCru >= 0 ? Math.min(999, Math.floor(prazoCru)) : null

  const dados = {
    name,
    legalName: texto(formData.get("legalName"), 160),
    document,
    documentDigits,
    stateRegistration: texto(formData.get("stateRegistration"), 30),
    cityRegistration: texto(formData.get("cityRegistration"), 30),
    category: texto(formData.get("category"), 60),
    email: texto(formData.get("email"), 160),
    phone: texto(formData.get("phone"), 30),
    contactName: texto(formData.get("contactName")),
    contactPhone: texto(formData.get("contactPhone"), 30),
    website: texto(formData.get("website"), 200),
    zipCode: texto(formData.get("zipCode"), 12),
    street: texto(formData.get("street"), 160),
    number: texto(formData.get("number"), 20),
    complement: texto(formData.get("complement"), 80),
    district: texto(formData.get("district"), 80),
    city: texto(formData.get("city"), 80),
    state: texto(formData.get("state"), 2),
    paymentTerms: texto(formData.get("paymentTerms"), 80),
    leadTimeDays,
    pixKey: texto(formData.get("pixKey"), 140),
    bankName: texto(formData.get("bankName"), 80),
    bankAgency: texto(formData.get("bankAgency"), 20),
    bankAccount: texto(formData.get("bankAccount"), 30),
    notes: texto(formData.get("notes"), 2000),
  }

  // ─── Duplicata AVISA, não trava ───────────────────────────────────────────
  //
  // Mesmo CNPJ cadastrado duas vezes divide o histórico de compras do
  // fornecedor em duas fichas. Mas travar seria pior: há motivo legítimo (duas
  // filiais do mesmo grupo, matriz e filial com o mesmo raiz digitado errado), e
  // uma trava aqui deixaria a pessoa sem saída no meio do cadastro.
  let aviso: string | undefined
  if (documentDigits) {
    const jaExiste = await prisma.supplier.findFirst({
      where: { tenantId, documentDigits, ...(id ? { id: { not: id } } : {}) },
      select: { name: true },
    })
    if (jaExiste) aviso = "documentoRepetido"
  }

  if (id) {
    const existe = await prisma.supplier.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })
    if (!existe) return { erro: "naoEncontrado" }
    await prisma.supplier.update({ where: { id }, data: dados })
  } else {
    const criado = await prisma.supplier.create({
      data: { ...dados, tenantId },
      select: { id: true },
    })
    revalidatePath("/fornecedores")
    return { ok: true, id: criado.id, aviso }
  }

  revalidatePath("/fornecedores")
  revalidatePath(`/fornecedores/${id}`)
  revalidatePath("/purchases")
  return { ok: true, id, aviso }
}

/**
 * Liga e desliga o fornecedor.
 *
 * Desativado some das escolhas de compra e cotação, e o histórico continua
 * inteiro. É o que substitui apagar na maior parte dos casos: quem parou de
 * comprar de alguém não quer perder o registro do que já comprou.
 */
export async function alternarFornecedor(id: string): Promise<EstadoFornecedor> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const f = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { active: true } })
  if (!f) return { erro: "naoEncontrado" }

  await prisma.supplier.update({
    where: { id },
    data: { active: !f.active, deactivatedAt: f.active ? new Date() : null },
  })

  revalidatePath("/fornecedores")
  revalidatePath("/purchases")
  return { ok: true }
}

/**
 * Apaga de vez — e só o que nunca deveria ter existido.
 *
 * ─── O defeito que isto fecha ────────────────────────────────────────────────
 *
 * A chave estrangeira da cotação era CASCADE: apagar um fornecedor apagava, sem
 * avisar, a participação dele em TODA cotação e os preços que ele deu. E como a
 * única forma de corrigir um dado errado era apagar e recadastrar, o caminho
 * para perder o histórico era o caminho NORMAL de uso.
 *
 * Agora o banco recusa (RESTRICT), e aqui a mensagem explica antes de tentar.
 * Fornecedor com histórico se DESATIVA.
 */
export async function excluirFornecedor(id: string): Promise<EstadoFornecedor> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER") return { erro: "semPermissao" }

  const f = await prisma.supplier.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { purchaseOrders: true, quotations: true } } },
  })
  if (!f) return { erro: "naoEncontrado" }
  if (f._count.quotations > 0 || f._count.purchaseOrders > 0) return { erro: "temHistorico" }

  await prisma.supplier.delete({ where: { id } })
  revalidatePath("/fornecedores")
  revalidatePath("/purchases")
  return { ok: true }
}
