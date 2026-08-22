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
 *  inteiro vive num orçamento de 60 segundos. O que sobrar entra amanhã. */
const MAX_POR_RODADA = 30

export async function conciliarNotasPendentes(): Promise<ResumoDaConciliacao> {
  const resumo: ResumoDaConciliacao = { consultadas: 0, emitidas: 0, rejeitadas: 0, erros: 0 }

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
    const estadoAtual = estadoDaNota(os.nfseStatus)
    if (!devePerguntar(estadoAtual, os.nfseChecks)) continue
    if (!os.tenant.nfeioCompanyId || !os.nfseId) continue

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

      if (estado === "emitida") resumo.emitidas++

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
