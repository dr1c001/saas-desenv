/**
 * Quanto tempo se espera por um serviço externo — e como distinguir "ele disse
 * não" de "não sei se saiu".
 *
 * ─── O defeito ───────────────────────────────────────────────────────────────
 *
 * As chamadas à Asaas, à nfe.io e ao Z-API não tinham timeout nenhum. Duas
 * delas rodam dentro do cron diário (60 s na Vercel): a conciliação de notas
 * consulta a nfe.io até 30 vezes, a régua de cobrança chama o Z-API até 200.
 * Um emissor pendurado segurava a função até a Vercel matá-la — e o
 * fechamento do CronRun e o `avisarFalhaDoCron` vêm DEPOIS: a falha apagava o
 * próprio alarme. O mesmo comentário já existia na etapa da Asaas, corrigida
 * em 20/08/2026 só ali. (Achado na auditoria de 13/09/2026.)
 *
 * ─── Por que o timeout sozinho seria pior ────────────────────────────────────
 *
 * Dois `catch` dependiam da AUSÊNCIA de timeout: o da emissão de nota (solta a
 * reserva em qualquer erro, "porque um erro é sempre a nfe.io dizendo não") e
 * o da assinatura (apaga a linha local em qualquer erro). Com timeout, "não
 * sei se saiu" passa a ser rotina — e soltar a reserva num "não sei" é emitir
 * a segunda nota no clique seguinte. Por isso este módulo também define
 * `RecusaExterna`: o serviço RESPONDEU, e disse não. Só ela devolve reserva
 * ou apaga linha. Timeout, `fetch failed` (socket caído depois do POST), JSON
 * malformado num 200, 5xx de gateway — tudo isso fica do lado TRAVADO: o
 * suporte destrava uma OS ou uma assinatura, mas ninguém desfaz uma nota
 * fiscal nem enxerga uma segunda cobrança recorrente que o sistema não
 * conhece.
 *
 * ─── Conta de tempo (honesta) ────────────────────────────────────────────────
 *
 * O `break` por orçamento é avaliado na cabeça do laço, então a última chamada
 * sempre pode estourar o orçamento inteiro: pior caso da conciliação = 10 + 5 s,
 * da régua = 15 + 8 s. Somados aos 40 × 3 s da reconciliação da Asaas e aos 25 s
 * da geocodificação, o teto teórico continua acima de 60 s — já era assim, e
 * isto não resolve; o que resolve é nenhuma etapa poder mais travar SOZINHA.
 * Risco residual conhecido: lib/resend.ts (SDK) também não tem timeout.
 *
 * Puro — sem prisma, sem next. Os testes mockam `@/lib/nfeio` e `@/lib/asaas`
 * por inteiro; quem importasse `ehTimeout` de lá receberia `undefined`.
 */
export const TEMPO_LIMITE_NFEIO_MS = 10_000
/** A consulta de status roda no cron, até 30 vezes: mais curta. */
export const TEMPO_LIMITE_NFEIO_CONSULTA_MS = 5_000
/** O certificado A1 é binário e sobe uma vez: mais folga. */
export const TEMPO_LIMITE_NFEIO_UPLOAD_MS = 20_000
export const TEMPO_LIMITE_ASAAS_MS = 10_000
export const TEMPO_LIMITE_ZAPI_MS = 8_000

/** Orçamento de tempo das duas etapas do cron que fazem várias chamadas. */
export const ORCAMENTO_CONCILIACAO_MS = 10_000
export const ORCAMENTO_REGUA_MS = 15_000

/**
 * O serviço externo RESPONDEU e disse não (HTTP não-ok).
 *
 * É a única falha em que se sabe que nada foi criado do outro lado — e, mesmo
 * assim, só quando `status < 500`: um 502/504 de gateway pode vir depois de o
 * backend ter processado.
 */
export class RecusaExterna extends Error {
  constructor(
    public readonly servico: string,
    public readonly status: number,
    public readonly corpo: string
  ) {
    super(`${servico} → ${status}: ${corpo}`)
    this.name = "RecusaExterna"
  }
}

/** O outro lado disse não, e disse antes de fazer qualquer coisa. */
export function ehRecusaCerta(e: unknown): e is RecusaExterna {
  return e instanceof RecusaExterna && e.status < 500
}

/**
 * O nosso `AbortSignal.timeout` disparou. Aceita também AbortError: nenhum
 * chamador passa `signal` próprio, então um abort só pode vir daqui.
 */
export function ehTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
}
