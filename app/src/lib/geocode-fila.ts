// A fila de geocodificação: quem coordena o lote com o banco.
//
// Separado de geocode-lote.ts porque aquele só fala com o provedor (e por isso
// é testável sem banco); aqui é onde o resultado encosta no Address.
//
// O ciclo tem duas metades, e elas rodam em execuções diferentes de propósito:
//
//   1. COLETAR o lote que já foi enviado antes. Se ainda estiver processando,
//      sai sem fazer nada e tenta de novo depois — sem reenviar, porque
//      reenviar gastaria crédito de novo pelo mesmo trabalho.
//   2. ENVIAR um lote novo com quem ainda está sem coordenada.
//
// Só existe um lote em voo por vez. É de propósito: mantém a ordem previsível,
// evita gastar crédito duas vezes com o mesmo endereço, e faz o pior caso ser
// "demora mais um dia", nunca "gastou a cota do mês numa madrugada".

import { prisma } from "@/lib/prisma"
import { chaveGeoapify, geocodeAddress } from "@/lib/geocode"
import {
  coletarLote,
  consultasDoLote,
  enviarLote,
  jobExpirado,
  MAX_POR_LOTE,
} from "@/lib/geocode-lote"

/**
 * Depois disto o endereço sai da fila.
 *
 * Endereço com cidade digitada errada nunca vai resolver. Sem um teto, ele
 * seria reenviado todo dia pra sempre: gasta crédito à toa e, pior, ocupa as
 * vagas do lote — endereço novo nunca chegaria a ser processado e o mapa
 * pararia de encher sem nenhum erro em lugar nenhum.
 *
 * Editar o endereço do cliente zera o contador, então corrigir a digitação
 * devolve o cliente pra fila naturalmente.
 *
 * Conta TENTATIVAS, não dias: uma rodada completa gasta duas (o lote e depois
 * a cascata de resgate). Seis são, na prática, três rodadas.
 */
export const MAX_TENTATIVAS = 6

export type ResultadoFila = {
  /** Endereços que ganharam coordenada nesta execução. */
  gravados: number
  /** Endereços mandados num lote novo, cujo resultado sai depois. */
  enviados: number
  /** Lote anterior ainda processando. */
  aguardando: boolean
  erros: number
}

const VAZIO: ResultadoFila = { gravados: 0, enviados: 0, aguardando: false, erros: 0 }

export type EnderecoDaFila = {
  id: string
  street: string | null
  number: string | null
  city: string | null
  state: string | null
}

/**
 * Quem ainda está sem coordenada e ainda vale a pena tentar.
 *
 * A ordenação por `geocodeTries` é o que impede a inanição: quem nunca foi
 * tentado passa na frente de quem já falhou.
 */
export async function semCoordenada(limite: number): Promise<EnderecoDaFila[]> {
  return prisma.address.findMany({
    where: {
      latitude: null,
      geocodeTries: { lt: MAX_TENTATIVAS },
      OR: [{ city: { not: null } }, { street: { not: null } }],
    },
    select: { id: true, street: true, number: true, city: true, state: true },
    orderBy: [{ geocodeTries: "asc" }, { id: "asc" }],
    take: limite,
  })
}

async function contarTentativa(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.address.updateMany({
    where: { id: { in: ids } },
    data: { geocodeTries: { increment: 1 } },
  })
}

/**
 * Avança a fila um passo. Devolve também quem o lote não resolveu, pra quem
 * chamou tentar a cascata com o tempo que ainda tiver.
 *
 * Sem chave do Geoapify não há lote — o Nominatim não tem essa API. Nesse caso
 * devolve zerado e quem chama cai no caminho avulso, que é o comportamento que
 * o sistema sempre teve.
 */
export async function avancarFila(
  quantidade = MAX_POR_LOTE
): Promise<ResultadoFila & { paraCascata: EnderecoDaFila[] }> {
  const chave = chaveGeoapify()
  if (!chave) return { ...VAZIO, paraCascata: [] }

  const resultado: ResultadoFila = { ...VAZIO }

  // ── 1. Coletar o lote anterior ────────────────────────────────────────────
  const pendente = await prisma.geocodeBatch.findFirst({ orderBy: { createdAt: "asc" } })
  if (pendente) {
    const ids = Array.isArray(pendente.addressIds) ? (pendente.addressIds as string[]) : []
    const coleta = await coletarLote(pendente.jobId, ids.length, chave)

    if (coleta.estado === "processando") {
      // Um job que o provedor nunca conclui bloquearia o envio do próximo pra
      // sempre, e o mapa nunca encheria — sem erro em lugar nenhum.
      if (jobExpirado(pendente.createdAt, new Date())) {
        await prisma.geocodeBatch.delete({ where: { id: pendente.id } })
        await contarTentativa(ids)
        return { ...resultado, erros: 1, paraCascata: [] }
      }
      return { ...resultado, aguardando: true, paraCascata: [] }
    }

    const falharam: string[] = []
    if (coleta.estado === "pronto") {
      for (let i = 0; i < ids.length; i++) {
        const coord = coleta.coordenadas[i]
        if (!coord) {
          falharam.push(ids[i])
          continue
        }
        try {
          await prisma.address.update({ where: { id: ids[i] }, data: coord })
          resultado.gravados++
        } catch {
          // Endereço apagado entre o envio e a coleta. Acontece, não é falha.
          resultado.erros++
        }
      }
    } else {
      falharam.push(...ids)
    }

    await prisma.geocodeBatch.delete({ where: { id: pendente.id } })
    await contarTentativa(falharam)

    // Quem o lote não achou volta pela cascata (rua-sem-número, só cidade),
    // que o lote não faz. É onde a maioria desses é resolvida.
    const paraCascata =
      falharam.length > 0
        ? await prisma.address.findMany({
            where: { id: { in: falharam }, latitude: null },
            select: { id: true, street: true, number: true, city: true, state: true },
          })
        : []

    return { ...resultado, paraCascata }
  }

  // ── 2. Enviar um lote novo ────────────────────────────────────────────────
  const fila = await semCoordenada(Math.min(quantidade, MAX_POR_LOTE))
  if (fila.length === 0) return { ...resultado, paraCascata: [] }

  const consultas = consultasDoLote(fila)
  const envio = await enviarLote(consultas, chave)
  if (!envio) return { ...resultado, erros: 1, paraCascata: [] }

  await prisma.geocodeBatch.create({
    data: { jobId: envio.jobId, addressIds: fila.map((f) => f.id) },
  })
  resultado.enviados = fila.length
  return { ...resultado, paraCascata: [] }
}

/**
 * Geocodificação avulsa, um a um, dentro de um orçamento de tempo.
 *
 * Continua existindo por dois motivos: é o único caminho quando não há chave
 * do Geoapify, e é ele que tem a CASCATA (rua-sem-número, só cidade) que o
 * lote não faz.
 */
export async function geocodificarAvulso(
  enderecos: EnderecoDaFila[],
  orcamentoMs: number
): Promise<{ gravados: number; erros: number }> {
  const inicio = Date.now()
  let gravados = 0
  let erros = 0
  const falharam: string[] = []

  for (const addr of enderecos) {
    if (Date.now() - inicio > orcamentoMs) break
    try {
      const coords = await geocodeAddress(addr)
      if (coords) {
        await prisma.address.update({ where: { id: addr.id }, data: coords })
        gravados++
      } else {
        falharam.push(addr.id)
      }
    } catch {
      erros++
    }
  }

  await contarTentativa(falharam)
  return { gravados, erros }
}
