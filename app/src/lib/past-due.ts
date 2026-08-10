/**
 * Regras de inadimplência: quanto tempo o cliente continua acessando depois de
 * a cobrança falhar, e quando ele é avisado.
 *
 * Módulo puro, sem banco e sem rede, por dois motivos: dá pra testar de
 * verdade, e o número de dias de carência passa a existir num lugar só. Se
 * "5 dias" morasse no bloqueio e "faltam X dias" fosse calculado à parte no
 * e-mail, um dia o aviso diria "faltam 2 dias" e o corte viria no dia seguinte.
 */

/** Dias de acesso normal após o fim do período pago, antes do bloqueio. */
export const PAST_DUE_GRACE_DAYS = 5

/** Dias de atraso em que sai um aviso por e-mail. Ordem crescente. */
export const AVISOS_ATRASO = [1, 3] as const

export type DecisaoAviso = {
  /** Se deve sair e-mail agora. */
  enviar: boolean
  /** Novo valor do contador — quantos marcos já venceram até hoje. */
  total: number
  /** Quantos dias de acesso ainda restam (nunca negativo). */
  diasRestantes: number
}

/**
 * Decide se o cliente recebe aviso hoje.
 *
 * `jaEnviados` é o contador guardado em Subscription.pastDueWarningsSent.
 *
 * O caso que justifica contar marcos em vez de comparar datas: se o cron
 * falhar no dia 1 e só rodar no dia 3, `devidos` vale 2 e `jaEnviados` vale 0 —
 * sai UM e-mail, o do dia 3 (o mais urgente), e o contador pula direto pra 2.
 * Comparando data exata, como o cron de NPS fazia antes, o marco perdido
 * simplesmente nunca mais aconteceria.
 */
export function decidirAviso(diasVencido: number, jaEnviados: number): DecisaoAviso {
  const devidos = AVISOS_ATRASO.filter((d) => diasVencido >= d).length
  return {
    enviar: devidos > jaEnviados,
    total: devidos,
    diasRestantes: Math.max(PAST_DUE_GRACE_DAYS - diasVencido, 0),
  }
}

/** Dias inteiros de atraso desde o fim do período pago. */
export function diasDeAtraso(fimDoPeriodo: Date, agora: Date): number {
  return Math.floor((agora.getTime() - fimDoPeriodo.getTime()) / 86_400_000)
}
