// Geocodificação em lote.
//
// O problema que isto resolve: uma empresa importa 800 clientes de planilha e
// o mapa fica vazio. Um a um, o backfill do cron dá conta de umas dezenas por
// execução — a planilha inteira levaria semanas, e o mapa (que é um dos
// motivos de assinar) fica quebrado durante todo esse tempo.
//
// O lote aceita 1.000 endereços numa requisição só e custa METADE do crédito
// por endereço. Mas é ASSÍNCRONO: a resposta é um job, e o resultado sai
// depois. Como função serverless tem orçamento de tempo curto, o job é
// GUARDADO no banco e coletado na execução seguinte. Sem isso, um lote que
// demore mais que o orçamento seria abandonado e reenviado todo dia, para
// sempre — o mapa nunca encheria e nada nos avisaria.

import { consultasPara, type AddressParts, type Coordenada } from "@/lib/geocode"

/** Teto do provedor por requisição. */
export const MAX_POR_LOTE = 1000

/**
 * Job abandonado depois disto.
 *
 * Se o provedor engasgar num job, o registro guardado bloquearia o envio do
 * próximo para sempre. Melhor descartar e recomeçar: o endereço continua sem
 * coordenada e volta pra fila naturalmente.
 */
export const HORAS_ATE_DESISTIR = 24

export type Submissao = { jobId: string }

/**
 * As consultas do lote, uma por endereço.
 *
 * O lote não tem cascata: manda a consulta MAIS ESPECÍFICA de cada endereço.
 * Quem voltar vazio continua sem coordenada e é pego depois pela busca avulsa,
 * que aí sim tenta rua-sem-número e cidade. Fazer a cascata dentro do lote
 * exigiria três lotes e triplicaria o custo pra melhorar poucos casos.
 */
export function consultasDoLote(enderecos: AddressParts[]): string[] {
  return enderecos.map((e) => consultasPara(e)[0] ?? "")
}

/**
 * Lê o resultado do lote, posição a posição.
 *
 * O casamento é POR ÍNDICE: o provedor devolve um item por endereço enviado,
 * na mesma ordem. Por isso a função exige `quantidade` e devolve sempre um
 * array desse tamanho — se a resposta vier curta, truncada ou fora de formato,
 * o que falta vira null em vez de deslocar todo mundo uma casa. Coordenada
 * deslocada põe o cliente no endereço do vizinho, e ninguém percebe olhando.
 */
export function lerResultadoDoLote(json: unknown, quantidade: number): (Coordenada | null)[] {
  const itens = Array.isArray(json) ? json : []
  const saida: (Coordenada | null)[] = []

  for (let i = 0; i < quantidade; i++) {
    const item = itens[i] as { lat?: unknown; lon?: unknown } | undefined
    if (!item) {
      saida.push(null)
      continue
    }
    const latitude = Number(item.lat)
    const longitude = Number(item.lon)
    saida.push(
      Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
    )
  }

  return saida
}

/** Envia o lote e devolve o identificador do job. */
export async function enviarLote(consultas: string[], chave: string): Promise<Submissao | null> {
  const uteis = consultas.filter((q) => q !== "")
  if (uteis.length === 0) return null
  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/batch/geocode/search?apiKey=${encodeURIComponent(chave)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Manda a lista COMPLETA, inclusive as vazias: o casamento é por
        // índice, então tirar as vazias aqui desalinharia tudo.
        body: JSON.stringify(consultas),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { id?: unknown }
    return typeof json?.id === "string" && json.id ? { jobId: json.id } : null
  } catch {
    return null
  }
}

export type Coleta =
  | { estado: "pronto"; coordenadas: (Coordenada | null)[] }
  /** Ainda processando — tentar de novo depois, sem reenviar (e sem gastar de novo). */
  | { estado: "processando" }
  /** Job perdido ou resposta inválida: descartar o registro e recomeçar. */
  | { estado: "perdido" }

/** Busca o resultado de um job já enviado. */
export async function coletarLote(
  jobId: string,
  quantidade: number,
  chave: string
): Promise<Coleta> {
  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/batch/geocode/search?id=${encodeURIComponent(jobId)}` +
        `&apiKey=${encodeURIComponent(chave)}&format=json`,
      { signal: AbortSignal.timeout(15_000) }
    )
    // 202 = ainda processando. É resposta normal, não erro.
    if (res.status === 202) return { estado: "processando" }
    if (!res.ok) return { estado: "perdido" }
    return { estado: "pronto", coordenadas: lerResultadoDoLote(await res.json(), quantidade) }
  } catch {
    // Rede caiu ou demorou: não dá pra saber se o job morreu. Trata como
    // "ainda processando" — o descarte por idade (HORAS_ATE_DESISTIR) é quem
    // impede um job zumbi de travar a fila pra sempre.
    return { estado: "processando" }
  }
}

/** O job guardado é velho demais pra valer a pena esperar? */
export function jobExpirado(criadoEm: Date, agora: Date): boolean {
  return agora.getTime() - criadoEm.getTime() > HORAS_ATE_DESISTIR * 3_600_000
}
