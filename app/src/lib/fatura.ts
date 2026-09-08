import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import React, { type ReactElement, type JSXElementConstructor } from "react"
import { prisma } from "./prisma"
import { cobrancaPix } from "./pix"
import { formatOsNumber } from "./utils"
import { FaturaPDF, type DadosDaFatura } from "@/components/pdf/fatura-pdf"

// Monta a FATURA de uma OS, em PDF, do lado do servidor.
//
// ─── Por que aqui, e não dentro de uma rota ─────────────────────────────────
//
// As rotas de PDF que já existem (OS, orçamento, recibo) montam o documento
// DENTRO do route handler, misturado com autenticação de sessão do Supabase.
// São inalcançáveis a partir do servidor: para anexar num e-mail disparado pelo
// cron não há cookie nenhum.
//
// O molde certo já existia num lugar só — `lib/contrato.ts` —, que devolve
// `{ buffer, nomeArquivo }` e serve DOIS consumidores: a rota HTTP e o anexo do
// e-mail. Esta função segue ele.
//
// ─── Por que NÃO é um arquivo "use server" ──────────────────────────────────
//
// Toda export de "use server" vira endereço HTTP despachável. Uma função que
// recebe orderId e devolve o PDF financeiro do cliente seria um endpoint que
// qualquer pessoa autenticada chamaria em OS alheia. Quem chama já se defendeu.

export type FaturaGerada = { buffer: Buffer; nomeArquivo: string; numero: string }

/**
 * A fatura de uma OS: as parcelas em aberto, o total e o PIX da empresa.
 *
 * `null` quando não há nada a cobrar — OS inexistente, de outra empresa, ou sem
 * nenhuma parcela em aberto. Devolver um PDF vazio seria pior: ele seria
 * anexado num e-mail e o cliente abriria um documento que não diz nada.
 */
export async function gerarFatura(
  tenantId: string,
  orderId: string
): Promise<FaturaGerada | null> {
  const os = await prisma.serviceOrder.findFirst({
    // tenantId no filtro: um orderId de fora não pode gerar a fatura de outra
    // empresa, com os dados do cliente dela dentro.
    where: { id: orderId, tenantId },
    select: {
      number: true,
      title: true,
      createdAt: true,
      client: { select: { name: true, document: true } },
      revenues: {
        select: { description: true, amount: true, dueDate: true, status: true },
        orderBy: { dueDate: "asc" },
      },
      tenant: {
        select: {
          name: true,
          document: true,
          phone: true,
          logoUrl: true,
          locale: true,
          pixKey: true,
          pixKeyType: true,
          pixReceiver: true,
          pixCity: true,
        },
      },
    },
  })
  if (!os || os.revenues.length === 0) return null

  const emAberto = os.revenues.filter((r) => r.status !== "PAID")
  if (emAberto.length === 0) return null

  // Soma em centavos: somar reais acumula resto binário, e o total impresso
  // passaria a diferir da soma das linhas do próprio documento.
  const totalEmAberto =
    emAberto.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0) / 100

  const numero = formatOsNumber(os.number, os.createdAt)
  const locale = os.tenant.locale === "en" ? "en" : "pt"

  // O PIX é da EMPRESA, com a chave dela — o dinheiro vai direto, sem
  // intermediário. É o "onde pagar" do documento.
  const pix = cobrancaPix(os.tenant, totalEmAberto, numero)

  const dados: DadosDaFatura = {
    locale,
    empresa: {
      nome: os.tenant.name,
      documento: os.tenant.document,
      telefone: os.tenant.phone,
      logoUrl: os.tenant.logoUrl,
    },
    cliente: { nome: os.client.name, documento: os.client.document },
    numero,
    titulo: os.title,
    // TODAS as parcelas entram, inclusive as pagas (riscadas): a conta precisa
    // fechar na cabeça de quem lê. O que muda é o TOTAL, que é só o em aberto.
    linhas: os.revenues.map((r) => ({
      descricao: r.description,
      vencimento: r.dueDate,
      valor: Number(r.amount),
      paga: r.status === "PAID",
    })),
    totalEmAberto,
    pix: pix?.codigo ?? null,
    emitidaEm: new Date(),
  }

  const buffer = await renderToBuffer(
    React.createElement(FaturaPDF, { dados }) as ReactElement<
      DocumentProps,
      string | JSXElementConstructor<unknown>
    >
  )

  return { buffer, nomeArquivo: `fatura-${numero}.pdf`, numero }
}

/**
 * Baixa o PDF da nota fiscal do emissor, para anexar.
 *
 * ─── Por que com timeout, e por que engolindo o erro ────────────────────────
 *
 * Isto roda DENTRO do cron diário, que tem sessenta segundos para tudo. Uma
 * chamada HTTP para o emissor fiscal, num loop de até duzentas mensagens, é
 * exatamente o tipo de coisa que derruba as etapas seguintes.
 *
 * Então: timeout curto, e falha vira `null` em vez de exceção. A cobrança sair
 * sem a nota anexada é muito melhor do que a cobrança não sair.
 */
export async function baixarNotaFiscal(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    // Um "PDF" de 20 bytes é página de erro do emissor, não documento. Anexar
    // isso faria o cliente abrir um arquivo quebrado em nome da empresa.
    if (buf.length < 1024) return null
    return buf
  } catch {
    return null
  }
}
