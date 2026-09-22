// Perguntar ao emissor o que aconteceu com as notas pendentes.
//
// A metade que faltava da emissão. Emitir era só o começo: a prefeitura
// responde depois, e sem ninguém perguntando a resposta nunca chegava ao
// sistema. Ver o cabeçalho de lib/nfse-status.ts para o estrago que isso
// causava.
//
// Roda no cron diário. Separado do cron de propósito: aqui é a regra de o que
// fazer com cada resposta, e ela precisa ser lida sem o barulho das outras
// oito etapas.

import { prisma } from "@/lib/prisma"
import { nfeio } from "@/lib/nfeio"
import { notificar } from "@/lib/notificar"
import { reconciliarComissao } from "@/lib/comissao-db"
import { arquivarNota } from "@/lib/arquivo-da-nota"
import { ehTimeout, ORCAMENTO_CONCILIACAO_MS } from "@/lib/tempo-limite"
import {
  devePerguntar,
  estadoDaNota,
  estadoDesconhecido,
  estadoFinal,
} from "@/lib/nfse-status"

export type ResumoDaConciliacao = {
  consultadas: number
  emitidas: number
  rejeitadas: number
  erros: number
}

/** Quantas notas por execução. Cada uma é uma chamada externa, e o cron
 *  inteiro vive num orçamento de 60 segundos. O que sobrar entra amanhã.
 *
 *  Teto de ITENS e orçamento de TEMPO, os dois: 30 consultas a um emissor
 *  pendurado eram 30 × (sem limite) — e, desde que a consulta tem timeout de
 *  5 s, seriam 150 s. O laço para quando o orçamento acaba, e para na hora
 *  ao primeiro timeout: emissor mudo hoje não vai responder à próxima. */
const MAX_POR_RODADA = 30

export async function conciliarNotasPendentes(
  orcamentoMs: number = ORCAMENTO_CONCILIACAO_MS,
  /** Injetável para o teste não depender do relógio de parede. Ver cobrar-vencidas.ts. */
  agoraMs: () => number = Date.now
): Promise<ResumoDaConciliacao> {
  const resumo: ResumoDaConciliacao = { consultadas: 0, emitidas: 0, rejeitadas: 0, erros: 0 }
  const fim = agoraMs() + orcamentoMs

  const pendentes = await prisma.serviceOrder.findMany({
    where: {
      nfseId: { not: null },
      // `null` é nota recém-enviada, que nunca teve estado gravado.
      OR: [{ nfseStatus: null }, { nfseStatus: { notIn: ESTADOS_FINAIS } }],
    },
    // Mais antigas primeiro: quem está esperando há mais tempo é quem mais
    // precisa de resposta.
    orderBy: { nfseIssuedAt: "asc" },
    take: MAX_POR_RODADA,
    select: {
      id: true, number: true, title: true, tenantId: true,
      nfseId: true, nfseStatus: true, nfseChecks: true,
      tenant: { select: { nfeioCompanyId: true } },
    },
  })

  for (const os of pendentes) {
    if (agoraMs() > fim) break
    const estadoAtual = estadoDaNota(os.nfseStatus)
    if (!devePerguntar(estadoAtual, os.nfseChecks)) continue
    if (!os.tenant.nfeioCompanyId || !os.nfseId) continue

    // A RESERVA presa: `reservando:<id>` é o que a emissão grava antes de
    // chamar o emissor e não apaga quando a resposta se perde (ver
    // actions/nfse.ts). Não é id de nota — perguntar ao emissor seria gastar
    // 5 s para receber 404 todo dia, e incrementar nfseChecks a faria sumir do
    // radar em 30 dias. Conta como erro para o alarme diário chegar ao
    // fundador até o suporte destravar a OS.
    if (os.nfseId.startsWith("reservando:")) {
      resumo.erros++
      console.error(`[nfse] OS ${os.number} está travada com a reserva de emissão — precisa de suporte`)
      continue
    }

    try {
      const nota = await nfeio.getInvoice(os.tenant.nfeioCompanyId, os.nfseId)
      resumo.consultadas++

      const estado = estadoDaNota(nota.flowStatus)

      // Nome que o código não conhece: registra em vez de adivinhar. É assim
      // que a lista de estados cresce com base no que acontece de verdade.
      if (estadoDesconhecido(nota.flowStatus)) {
        console.error(`[nfse] estado desconhecido do emissor: "${nota.flowStatus}" (OS ${os.number})`)
      }

      await prisma.serviceOrder.update({
        where: { id: os.id },
        data: {
          nfseStatus: nota.flowStatus,
          nfseNumber: nota.number ?? undefined,
          // O PDF só existe depois de a prefeitura aceitar — é por isso que o
          // link ficava nulo quando era gravado no instante da emissão.
          nfseUrl: nota.pdf?.url ?? undefined,
          nfseChecks: { increment: 1 },
        },
      })

      // A comissao do responsavel muda AQUI, e nao na emissao.
      //
      // `nfseIssuedAt` e carimbado no ENVIO, antes de a prefeitura responder.
      // Descontar o ISS naquele instante deixaria a comissao liquida de um
      // imposto que ninguem vai recolher toda vez que a nota fosse rejeitada —
      // e sempre contra o funcionario. Aqui ja se sabe o que a prefeitura
      // decidiu, e o reconciliador converge para o valor certo nos dois casos.
      await reconciliarComissao(prisma, os.tenantId, os.id)

      if (estado === "emitida") {
        resumo.emitidas++
        // ARQUIVA o documento no instante em que a prefeitura aceita.
        //
        // É o único momento em que ele é final: uma nota pendente ainda vai
        // mudar, e uma rejeitada não tem PDF que preste. E o XML só existe
        // aqui — ele não é guardado em campo nenhum, então se não for baixado
        // agora, some.
        //
        // Nunca lança: a conciliação das outras notas não pode cair por causa
        // do storage de uma.
        await arquivarNota({
          tenantId: os.tenantId,
          orderId: os.id,
          pdfUrl: nota.pdf?.url,
          xmlUrl: nota.xml?.url,
        })
      }

      if (estado === "rejeitada") {
        resumo.rejeitadas++
        // O ponto inteiro desta rotina: nota recusada precisa CHEGAR em
        // alguém. Antes, a OS ficava faturada e a nota simplesmente não
        // existia — sem erro, sem aviso, sem ninguém sabendo.
        await notificar({
          tenantId: os.tenantId,
          evento: "notaRejeitada",
          corpo: os.title,
          url: `/service-orders/${os.id}`,
          referencia: os.id,
        })
      }
    } catch (err) {
      resumo.erros++
      // Emissor mudo: para a rodada. As próximas 29 consultas iam bater no
      // mesmo timeout, e a nota não tem culpa — não conta como tentativa dela.
      if (ehTimeout(err)) {
        console.error(`[nfse] o emissor não respondeu a tempo (OS ${os.number}) — rodada encerrada`)
        break
      }
      // Conta a tentativa mesmo com erro: senão uma nota cujo id o emissor não
      // reconhece seria consultada todo dia, para sempre.
      await prisma.serviceOrder
        .update({ where: { id: os.id }, data: { nfseChecks: { increment: 1 } } })
        .catch(() => null)
      console.error(`[nfse] falha ao consultar a nota da OS ${os.number}:`, err)
    }
  }

  return resumo
}

/** Os estados que não precisam mais ser consultados, na grafia do emissor.
 *  Filtrar no banco evita trazer nota resolvida só para descartar depois. */
const ESTADOS_FINAIS = [
  "Issued", "Done", "Cancelled", "IssueFailed", "Error",
]

/** Guarda de coerência: a lista acima é grafia do emissor e existe só para a
 *  consulta ao banco — a decisão continua sendo do `estadoDaNota`. Se as duas
 *  divergirem, nota resolvida volta a ser consultada (barato) ou pendente para
 *  de ser (caro). O teste confere. */
export function estadosFinaisConferem(): boolean {
  return ESTADOS_FINAIS.every((s) => estadoFinal(estadoDaNota(s)))
}
