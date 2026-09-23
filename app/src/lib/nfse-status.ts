// O estado de uma nota fiscal, e quando parar de perguntar.
//
// ─── O problema que isto resolve ─────────────────────────────────────────────
//
// Emitir NFS-e é ASSÍNCRONO. Quando o sistema chama o emissor, a nota nasce em
// processamento e só depois a prefeitura devolve "emitida" ou "rejeitada" —
// segundos, minutos, às vezes mais.
//
// Até 22/08/2026 o sistema gravava o `flowStatus` daquele instante e nunca
// mais perguntava. Não havia webhook, não havia consulta periódica, e o cron
// não mencionava NFS-e uma única vez. As consequências:
//
//   - `nfseUrl` ficava nulo, porque o PDF ainda não existia na hora da chamada
//   - o status na tela congelava em "processando" para sempre
//   - e a OS era marcada como faturada MESMO SE A PREFEITURA REJEITASSE
//
// Ou seja: OS faturada, receita lançada no financeiro, e nota fiscal nenhuma —
// sem ninguém descobrir. Num documento fiscal isso não é inconveniência.
//
// ─── Por que a lista de estados é defensiva ──────────────────────────────────
//
// Os nomes abaixo são os que o emissor usa hoje. Um nome novo, ou grafado
// diferente, NÃO pode ser tratado como "deu certo" nem como "deu errado" — os
// dois erram feio. Desconhecido continua sendo PENDENTE: o sistema segue
// perguntando, o valor aparece no log, e ninguém recebe uma resposta inventada
// sobre um documento fiscal.

export type EstadoDaNota = "pendente" | "emitida" | "rejeitada" | "cancelada"

/** Nomes que significam nota válida na prefeitura. */
const EMITIDA = ["issued", "done", "succeeded", "success"]

/** Nomes que significam que a nota NÃO existe e não vai existir. */
const REJEITADA = ["issuefailed", "failed", "error", "denied", "rejected"]

/** Cancelada depois de emitida — final, e diferente de rejeitada. */
const CANCELADA = ["cancelled", "canceled", "cancelamentoefetuado"]

function normalizar(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/gi, "")
    .toLowerCase()
}

/**
 * O que o estado do emissor significa para nós.
 *
 * Devolve `pendente` para qualquer coisa que não seja reconhecidamente final —
 * inclusive nome desconhecido. É a direção segura: continuar perguntando custa
 * uma chamada; concluir errado sobre documento fiscal custa a nota.
 */
export function estadoDaNota(flowStatus: string | null | undefined): EstadoDaNota {
  if (!flowStatus) return "pendente"
  const s = normalizar(flowStatus)
  if (EMITIDA.includes(s)) return "emitida"
  if (REJEITADA.includes(s)) return "rejeitada"
  if (CANCELADA.includes(s)) return "cancelada"
  return "pendente"
}

/** Chegou ao fim? Estado final não precisa ser consultado de novo. */
export function estadoFinal(estado: EstadoDaNota): boolean {
  return estado !== "pendente"
}

/** O emissor mandou um nome que o código não conhece? Vale registrar, para a
 *  lista crescer com base no que acontece de verdade, e não por adivinhação. */
export function estadoDesconhecido(flowStatus: string | null | undefined): boolean {
  return !!flowStatus && estadoDaNota(flowStatus) === "pendente" && !ehEsperaConhecida(flowStatus)
}

/** Nomes de espera que o emissor usa e que já sabemos que são normais. */
const ESPERA = [
  "processing", "waitingsend", "waitingreturn", "waitingcalculatetaxes",
  "waitingdefinerpsnumber", "waitingsendcancel", "waitingdownload", "created", "pending",
]

function ehEsperaConhecida(flowStatus: string): boolean {
  return ESPERA.includes(normalizar(flowStatus))
}

/**
 * Quantas vezes perguntar antes de desistir.
 *
 * O cron roda uma vez por dia, então isto é um mês de tentativas. Nota que não
 * resolveu em um mês não resolve sozinha — o que ela precisa é de alguém
 * olhando, e não de mais uma consulta diária para sempre.
 */
export const MAX_CONSULTAS = 30

/** Ainda vale perguntar por esta nota? */
export function devePerguntar(estado: EstadoDaNota, consultas: number): boolean {
  return !estadoFinal(estado) && consultas < MAX_CONSULTAS
}
