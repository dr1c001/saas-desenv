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
import { arquivarNota, faltouArquivar } from "@/lib/arquivo-da-nota"
import { avisarPendenciaUmaVez } from "@/lib/pendencia"
import { avisarPendenciaDeConfiguracao } from "@/lib/resend"
import { ehTimeout, ORCAMENTO_CONCILIACAO_MS } from "@/lib/tempo-limite"
import {
  devePerguntar,
  estadoDaNota,
  estadoDesconhecido,
  estadoFinal,
  MAX_CONSULTAS,
} from "@/lib/nfse-status"

export type ResumoDaConciliacao = {
  consultadas: number
  emitidas: number
  rejeitadas: number
  /** Notas aceitas cujo documento NÃO entrou no arquivo. Somam em `erros`. */
  naoArquivadas: number
  erros: number
}

/** Por quantos dias se tenta rearquivar. Depois disso a URL do emissor
 *  provavelmente já expirou, e insistir é gastar rede à toa. */
const JANELA_DE_REARQUIVO_DIAS = 30
/** Quantos rearquivos por rodada. Cada um são dois downloads e dois uploads. */
const MAX_REARQUIVOS_POR_RODADA = 5

/** O que a emissão grava antes de chamar o emissor. Ver actions/nfse.ts. */
const PREFIXO_DA_RESERVA = "reservando:"

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
  /** Injetável para o teste não depender do relógio de parede. Ver
   *  cobrar-vencidas.ts. Governa o orçamento E a janela de rearquivo. */
  agoraMs: () => number = Date.now
): Promise<ResumoDaConciliacao> {
  const resumo: ResumoDaConciliacao = { consultadas: 0, emitidas: 0, rejeitadas: 0, naoArquivadas: 0, erros: 0 }
  const fim = agoraMs() + orcamentoMs

  const pendentes = await prisma.serviceOrder.findMany({
    where: {
      nfseId: { not: null },
      // `null` é nota recém-enviada, que nunca teve estado gravado.
      OR: [{ nfseStatus: null }, { nfseStatus: { notIn: ESTADOS_FINAIS } }],
      // ── Quem já não é perguntado NÃO OCUPA VAGA ──────────────────────────
      //
      // `devePerguntar` descartava estas DENTRO do laço, com `continue`. Mas o
      // `take` é do banco: trinta notas abandonadas (30 consultas sem
      // resolver) enchiam as trinta vagas e nenhuma nota da plataforma era
      // consultada nunca mais — e o `orderBy` mais-antigas-primeiro garante
      // que as abandonadas fiquem sempre na frente. O mesmo defeito da fila do
      // NPS (lib/nps-fila.ts): filtrar em memória o que o banco pagina.
      //
      // A reserva presa também sai daqui: ela não é id de nota, perguntar por
      // ela é receber 404, e ela nunca incrementa `nfseChecks` — ficaria na
      // fila para sempre. As duas viram PENDÊNCIA avisada uma vez (abaixo).
      // (Achado na auditoria de 13/09/2026.)
      nfseChecks: { lt: MAX_CONSULTAS },
      NOT: { nfseId: { startsWith: PREFIXO_DA_RESERVA } },
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

    try {
      const nota = await nfeio.getInvoice(os.tenant.nfeioCompanyId, os.nfseId)
      resumo.consultadas++

      const estado = estadoDaNota(nota.flowStatus)

      // A nota que ACABOU de esgotar as tentativas. Avisa UMA VEZ, por nota.
      //
      // Não conta erro do cron: a tarefa rodou, e a nota precisa de uma pessoa
      // olhando — não de `CronRun.ok = false` todo dia até alguém resolver,
      // que é o defeito que o vigia de DMARC cometeu entre 15 e 22/09/2026
      // (ver lib/pendencia.ts).
      if (!estadoFinal(estado) && os.nfseChecks + 1 >= MAX_CONSULTAS) {
        await avisarPendenciaUmaVez({
          chave: `nfse:abandonada:${os.id}`,
          detalhe: `OS ${os.number}: ${MAX_CONSULTAS} consultas sem resposta final (${nota.flowStatus})`,
          enviar: () =>
            avisarPendenciaDeConfiguracao({
              titulo: `nota fiscal sem resposta na OS ${os.number}`,
              motivo:
                `A nota foi enviada ao emissor e, depois de ${MAX_CONSULTAS} consultas — um mês —, ` +
                `continua em "${nota.flowStatus}". O sistema parou de perguntar.`,
              comoResolver:
                `Abra a nota no painel da nfe.io e veja o que a prefeitura respondeu. ` +
                `Nota que não resolve em um mês precisa de alguém olhando, não de mais uma consulta diária.`,
            }),
        })
      }

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
          // O endereço do XML fica GRAVADO. Sem isto, um arquivamento que
          // falha logo abaixo perderia o documento para sempre: a OS já saiu
          // da fila do dia seguinte, e a URL morria com a variável.
          nfseXmlUrl: nota.xml?.url ?? undefined,
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
        // mudar, e uma rejeitada não tem PDF que preste.
        //
        // Nunca lança: a conciliação das outras notas não pode cair por causa
        // do storage de uma. Mas o resultado NÃO é mais jogado fora — era
        // assim que o documento sumia em silêncio, com o cron marcando o dia
        // como bom. O que falhou aqui volta na segunda fase, amanhã.
        const feito = await arquivarNota({
          tenantId: os.tenantId,
          orderId: os.id,
          pdfUrl: nota.pdf?.url,
          xmlUrl: nota.xml?.url,
        })
        const faltou = faltouArquivar({ pdfUrl: nota.pdf?.url, xmlUrl: nota.xml?.url }, feito)
        if (faltou.length > 0) {
          resumo.naoArquivadas++
          resumo.erros++
          console.error(
            `[nfse] nota da OS ${os.number} aceita mas NÃO arquivada (${faltou.join(", ")}) — tenta de novo amanhã`
          )
        }
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

  // ── As RESERVAS PRESAS ───────────────────────────────────────────────────
  //
  // `reservando:<id>` é o que a emissão grava antes de chamar o emissor e não
  // apaga quando a resposta se perde (ver actions/nfse.ts) — de propósito:
  // travada é o lado certo, porque ninguém desfaz uma nota fiscal. Mas a OS
  // fica parada até alguém olhar, e isso precisa CHEGAR em alguém.
  //
  // Uma vez por OS, e não erro do cron todo dia: a tarefa rodou.
  try {
    const presas = await prisma.serviceOrder.findMany({
      where: { nfseId: { startsWith: PREFIXO_DA_RESERVA } },
      take: MAX_REARQUIVOS_POR_RODADA,
      select: { id: true, number: true },
    })
    for (const os of presas) {
      await avisarPendenciaUmaVez({
        chave: `nfse:reserva-presa:${os.id}`,
        detalhe: `OS ${os.number} travada na reserva de emissão`,
        enviar: () =>
          avisarPendenciaDeConfiguracao({
            titulo: `emissão travada na OS ${os.number}`,
            motivo:
              "A emissão foi enviada ao emissor e a resposta se perdeu (tempo esgotado, conexão caída). " +
              "A nota PODE ter saído, então a OS ficou travada de propósito — soltar a trava emitiria uma segunda.",
            comoResolver:
              "Confira no painel da nfe.io se a nota existe. Se existir, lance o id dela na OS; " +
              "se não existir, o suporte libera a OS para emitir de novo.",
          }),
      })
    }
  } catch (err) {
    console.error("[nfse] a varredura de reservas presas falhou:", err)
    resumo.erros++
  }

  // ── Segunda fase: o que ficou por arquivar ──────────────────────────────
  //
  // A primeira fase arquiva no instante em que a prefeitura aceita. Quando o
  // storage está fora naquele minuto, a nota já saiu da fila (o estado dela é
  // final e verdadeiro) e nunca mais voltaria — era o defeito.
  //
  // Esta fase NÃO consulta o emissor: ela usa as URLs já gravadas. Só alcança
  // notas com `nfseXmlUrl`, ou seja, emitidas a partir de 22/09/2026; as
  // antigas continuam entrando sob demanda, quando alguém pede o download.
  //
  // Sem orçamento próprio: o `fim` acima vale para a função inteira.
  try {
    if (agoraMs() <= fim) {
      const semArquivo = await prisma.serviceOrder.findMany({
        where: {
          nfseXmlUrl: { not: null },
          nfseXmlPath: null,
          // O MESMO relógio do orçamento: um só, para o teste não precisar
          // de dois e para a janela não depender do relógio de parede.
          nfseIssuedAt: { gte: new Date(agoraMs() - JANELA_DE_REARQUIVO_DIAS * 86_400_000) },
        },
        orderBy: { nfseIssuedAt: "asc" },
        take: MAX_REARQUIVOS_POR_RODADA,
        select: {
          id: true, number: true, tenantId: true,
          nfseUrl: true, nfseXmlUrl: true, nfsePdfPath: true,
        },
      })

      for (const os of semArquivo) {
        if (agoraMs() > fim) break
        const feito = await arquivarNota({
          tenantId: os.tenantId,
          orderId: os.id,
          pdfUrl: os.nfseUrl,
          xmlUrl: os.nfseXmlUrl,
          jaTemPdf: Boolean(os.nfsePdfPath),
        })
        // O PDF já arquivado não é cobrado de novo.
        const faltou = faltouArquivar(
          { pdfUrl: os.nfsePdfPath ? null : os.nfseUrl, xmlUrl: os.nfseXmlUrl },
          feito
        )
        if (faltou.length > 0) {
          resumo.naoArquivadas++
          resumo.erros++
          console.error(`[nfse] rearquivo da OS ${os.number} falhou (${faltou.join(", ")})`)
        }
      }
    }
  } catch (err) {
    console.error("[nfse] a fila de rearquivo falhou:", err)
    resumo.erros++
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
