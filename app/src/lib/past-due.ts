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
export const PAST_DUE_GRACE_DAYS = 30

/**
 * Dias de atraso em que sai um aviso por e-mail. Ordem crescente.
 *
 * A régua fica junta e apertada no começo (1, 3) porque a maioria das falhas
 * de cobrança é boba — cartão vencido, limite, saldo — e se resolve no mesmo
 * dia em que a pessoa lembra. Depois espaça, para não virar perseguição a quem
 * está passando por aperto e já sabe que deve.
 *
 * O último marco coincide com o fim da carência de propósito: no dia 30 o
 * acesso é cortado, e o e-mail daquele dia é o aviso de BLOQUEIO, não mais um
 * "faltam X dias". Ver `momentoDoAviso`.
 */
export const AVISOS_ATRASO = [1, 3, 10, 15, 20, 25, 30] as const

export type DecisaoAviso = {
  /** Se deve sair e-mail agora. */
  enviar: boolean
  /** Novo valor do contador — quantos marcos já venceram até hoje. */
  total: number
  /** Quantos dias de acesso ainda restam (nunca negativo). */
  diasRestantes: number
  /** Que tom o e-mail tem hoje. Ver `momentoDoAviso`. */
  momento: Momento
}

/**
 * O tom do aviso de hoje.
 *
 * Mora AQUI, junto da conta dos dias, e não no módulo de e-mail. Estava lá —
 * `resend.ts` decidia sozinho que urgente é `diasRestantes <= 2`, separado do
 * lugar que sabe quantos dias de carência existem. Com a carência subindo de 5
 * para 30 essas duas metades divergiriam em silêncio: o corte mudaria de dia e
 * o e-mail continuaria ficando urgente na véspera de um prazo que não existe
 * mais.
 */
export type Momento = "aviso" | "urgente" | "bloqueio"

export function momentoDoAviso(diasRestantes: number): Momento {
  // Zero não é "resta pouco": é o dia do corte. Dizer "faltam 0 dias" para
  // quem acabou de perder o acesso é pior do que não avisar.
  if (diasRestantes <= 0) return "bloqueio"
  if (diasRestantes <= 5) return "urgente"
  return "aviso"
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
  const diasRestantes = Math.max(PAST_DUE_GRACE_DAYS - diasVencido, 0)
  return {
    enviar: devidos > jaEnviados,
    total: devidos,
    diasRestantes,
    momento: momentoDoAviso(diasRestantes),
  }
}

/** Dias inteiros de atraso desde o fim do período pago. */
export function diasDeAtraso(fimDoPeriodo: Date, agora: Date): number {
  return Math.floor((agora.getTime() - fimDoPeriodo.getTime()) / 86_400_000)
}
