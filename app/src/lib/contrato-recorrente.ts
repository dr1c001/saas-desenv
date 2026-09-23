// Contrato de serviço recorrente: quando a próxima execução acontece.
//
// Por que isto vale tanto: boa parte do mercado de serviço vive de contrato,
// não de chamado avulso — limpeza semanal, jardinagem mensal, suporte de TI,
// piscina quinzenal, dedetização trimestral. O sistema só sabia lidar com o
// avulso. E cliente que fatura recorrente pelo sistema não cancela o sistema.
//
// Módulo puro porque é aqui que mora a armadilha: a data. Conta de calendário
// erra em silêncio — a OS simplesmente não nasce, ou nasce no dia errado, e
// ninguém percebe até o cliente final ligar cobrando a visita.

export type Frequencia =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"

export const FREQUENCIAS: Frequencia[] = [
  "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL",
]

const MESES_A_SOMAR: Partial<Record<Frequencia, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
}

const DIAS_A_SOMAR: Partial<Record<Frequencia, number>> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
}

/** Quantos dias tem o mês (mês 1-12). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/**
 * Próxima data de execução.
 *
 * `diaBase` é o dia do mês ESCOLHIDO NO CONTRATO, não o dia da última
 * execução. Essa distinção é o ponto todo: um contrato no dia 31 executa em
 * 28/fev, e a próxima tem que ser 31/mar — não 28/mar. Derivar da data
 * anterior faria o contrato "andar pra trás" um pouco a cada mês curto até
 * virar dia 28 pra sempre.
 *
 * Trabalha em UTC de propósito: as datas são guardadas como meia-noite BRT
 * convertida, e somar mês em horário local introduz erro no horário de verão.
 */
export function proximaData(
  atual: Date,
  frequencia: Frequencia,
  diaBase?: number | null
): Date {
  const dias = DIAS_A_SOMAR[frequencia]
  if (dias) {
    const d = new Date(atual)
    d.setUTCDate(d.getUTCDate() + dias)
    return d
  }

  const meses = MESES_A_SOMAR[frequencia] ?? 1
  const ano = atual.getUTCFullYear()
  const mes = atual.getUTCMonth() // 0-11

  const alvoMes = mes + meses
  const alvoAno = ano + Math.floor(alvoMes / 12)
  const mesNormalizado = ((alvoMes % 12) + 12) % 12

  // Sem diaBase, mantém o dia da data atual — é o comportamento esperado de
  // quem não escolheu nada.
  const desejado = diaBase ?? atual.getUTCDate()
  const limite = diasNoMes(alvoAno, mesNormalizado + 1)

  return new Date(
    Date.UTC(alvoAno, mesNormalizado, Math.min(desejado, limite), 0, 0, 0, 0)
  )
}

/**
 * Quantos dias antes da data a OS deve nascer.
 *
 * Zero seria inútil: a OS apareceria no próprio dia da visita, tarde demais
 * pra encaixar na rota e avisar o cliente. Três dias dá tempo de organizar sem
 * poluir a lista com trabalho de semanas à frente.
 */
export const DIAS_DE_ANTECEDENCIA = 3

/**
 * O contrato deve gerar OS agora?
 *
 * Compara só a data (sem hora): o cron roda uma vez por dia num horário fixo,
 * e comparar com hora faria a geração depender de o cron atrasar alguns
 * minutos.
 */
export function deveGerar(
  proxima: Date,
  hoje: Date,
  antecedencia = DIAS_DE_ANTECEDENCIA
): boolean {
  const limite = new Date(hoje)
  limite.setUTCDate(limite.getUTCDate() + antecedencia)
  return soData(proxima) <= soData(limite)
}

function soData(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * O contrato ainda está valendo nesta data?
 *
 * Contrato encerrado que continuasse gerando OS criaria trabalho — e cobrança —
 * pra um cliente que já saiu.
 */
export function estaVigente(
  contrato: { active: boolean; startsAt: Date; endsAt?: Date | null },
  quando: Date
): boolean {
  if (!contrato.active) return false
  if (soData(contrato.startsAt) > soData(quando)) return false
  if (contrato.endsAt && soData(contrato.endsAt) < soData(quando)) return false
  return true
}

/**
 * Avança a data até passar de hoje.
 *
 * Existe pro caso de o cron ficar dias parado (ou o contrato ser reativado
 * depois de um tempo): sem isto, um contrato mensal atrasado em 3 meses
 * geraria 3 OS de uma vez, todas com data no passado. Gera uma só, na próxima
 * data que faz sentido.
 */
export function alcancarHoje(
  proxima: Date,
  frequencia: Frequencia,
  diaBase: number | null | undefined,
  hoje: Date,
  maxSaltos = 120
): Date {
  let d = proxima
  let saltos = 0
  while (soData(d) < soData(hoje) && saltos < maxSaltos) {
    d = proximaData(d, frequencia, diaBase)
    saltos++
  }
  return d
}
