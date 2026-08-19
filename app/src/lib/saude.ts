// Saúde do sistema.
//
// O problema: o Sentry pega exceção, mas ninguém é avisado quando o site
// simplesmente para de responder às 2h da manhã — nem quando o cron diário
// morre em silêncio. Silêncio é indistinguível de sucesso, e essa é a pior
// propriedade que um sistema de fundo pode ter.
//
// A parte que só o dono resolve: **um monitor que roda na mesma
// infraestrutura que monitora não serve.** Se a Vercel cair, um cron da Vercel
// não vai avisar ninguém. A checagem de fora é serviço de terceiro; o que este
// módulo faz é dar a ela algo honesto para encontrar — incluindo o estado do
// cron, que de fora ninguém consegue ver.
//
// Módulo puro: um monitor que responde "tudo bem" quando não está é pior que
// monitor nenhum, porque cria confiança falsa.

/** O cron roda uma vez por dia (12:00 UTC, ver vercel.json). */
export const HORAS_ENTRE_EXECUCOES = 24

/**
 * Tolerância antes de considerar o cron parado.
 *
 * 26h, não 24: a Vercel não garante o minuto exato, e um atraso de meia hora
 * não é queda. Alarme que dispara por atraso normal é alarme que a pessoa
 * aprende a ignorar — e aí ele deixa de funcionar justamente no dia real.
 */
export const HORAS_ATE_ALARMAR = 26

export type Estado = "saudavel" | "degradado"

export type Diagnostico = {
  estado: Estado
  /** Cada verificação, para a resposta dizer O QUE está ruim, não só que está. */
  checagens: {
    banco: Estado
    cron: Estado
  }
  /** Há quantas horas o cron rodou com sucesso pela última vez. */
  horasDesdeOCron: number | null
}

export type Entrada = {
  bancoRespondeu: boolean
  /** Último início de execução BEM-SUCEDIDA do cron. */
  ultimoCronOk: Date | null
  /** Se o sistema já rodou tempo suficiente pra ter tido um cron. */
  primeiroRegistroEm: Date | null
  agora: Date
}

export function diagnosticar(e: Entrada): Diagnostico {
  const banco: Estado = e.bancoRespondeu ? "saudavel" : "degradado"

  const horas =
    e.ultimoCronOk === null
      ? null
      : (e.agora.getTime() - e.ultimoCronOk.getTime()) / 3_600_000

  const cron: Estado = decidirCron(e, horas)

  return {
    // Basta uma checagem ruim: a resposta precisa ser conservadora, porque é
    // dela que sai o código HTTP que faz o monitor externo alertar.
    estado: banco === "saudavel" && cron === "saudavel" ? "saudavel" : "degradado",
    checagens: { banco, cron },
    horasDesdeOCron: horas === null ? null : Math.round(horas * 10) / 10,
  }
}

function decidirCron(e: Entrada, horas: number | null): Estado {
  if (horas !== null) return horas > HORAS_ATE_ALARMAR ? "degradado" : "saudavel"

  // Nunca rodou. Num sistema recém-implantado isso é normal — alarmar aqui
  // faria o monitor nascer vermelho e ensinar a pessoa a ignorá-lo antes
  // mesmo de ele servir pra alguma coisa. Só vira problema depois de ter
  // passado tempo suficiente pra um cron ter acontecido.
  if (!e.primeiroRegistroEm) return "saudavel"
  const horasDeVida = (e.agora.getTime() - e.primeiroRegistroEm.getTime()) / 3_600_000
  return horasDeVida > HORAS_ATE_ALARMAR ? "degradado" : "saudavel"
}

/**
 * O código HTTP da resposta.
 *
 * 503 quando degradado é o detalhe que faz tudo funcionar: monitor de uptime
 * alerta em resposta não-2xx. Devolver 200 com `{"estado":"degradado"}` no
 * corpo seria bonito e inútil — nenhum monitor lê corpo por padrão.
 */
export function statusHttp(d: Diagnostico): number {
  return d.estado === "saudavel" ? 200 : 503
}
