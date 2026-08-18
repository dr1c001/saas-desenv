// Garantia do serviço: prazo escolhido pela empresa e data de vencimento.
//
// O prazo é campo próprio, não uma frase dentro dos termos, por um motivo
// prático: assim o documento mostra a DATA em que a garantia vence. O cliente
// final lê "válida até 15/11/2026" em vez de "90 dias" e ter que descobrir de
// quando contar — que é exatamente onde nasce discussão depois.
//
// Módulo puro: conta de calendário erra em silêncio.

export const MAX_DIAS_GARANTIA = 3650 // 10 anos, teto de sanidade

/**
 * Quantos dias valem para esta OS.
 *
 * A OS manda quando tem valor próprio; senão vale o padrão da empresa. Zero é
 * uma escolha legítima ("sem garantia") e precisa sobrepor o padrão — por isso
 * a checagem é por null/undefined, não por valor falso.
 */
export function diasDeGarantia(
  daOs: number | null | undefined,
  padraoDaEmpresa: number | null | undefined
): number | null {
  if (daOs !== null && daOs !== undefined) return daOs
  if (padraoDaEmpresa !== null && padraoDaEmpresa !== undefined) return padraoDaEmpresa
  return null
}

/**
 * Até quando a garantia vale.
 *
 * Conta a partir da CONCLUSÃO, não da abertura: a garantia de um serviço
 * começa quando ele fica pronto. Uma OS aberta em janeiro e concluída em
 * março tem garantia até junho, não até abril.
 *
 * Devolve null quando a OS ainda não foi concluída — não há de quando contar.
 */
export function garantiaAte(concluidaEm: Date | null | undefined, dias: number | null): Date | null {
  if (!concluidaEm || dias === null || dias <= 0) return null
  const d = new Date(concluidaEm)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

/** A garantia ainda está valendo nesta data? */
export function garantiaVigente(vence: Date | null, quando: Date): boolean {
  if (!vence) return false
  const soData = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
  return soData(vence) >= soData(quando)
}

/**
 * Como escrever o prazo de forma legível.
 *
 * Múltiplos exatos de 30 e 365 viram "meses" e "anos" porque é assim que se
 * fala — "garantia de 90 dias" é correto, mas "3 meses" é o que a pessoa
 * entende sem pensar.
 */
export function prazoPorExtenso(
  dias: number,
  t: (chave: string, vals?: Record<string, number>) => string
): string {
  if (dias <= 0) return t("garantia.semGarantia")
  if (dias % 365 === 0) return t("garantia.anos", { n: dias / 365 })
  if (dias % 30 === 0) return t("garantia.meses", { n: dias / 30 })
  return t("garantia.dias", { n: dias })
}

/** Sugestões da tela. Cobrem o que a maioria dos ramos usa. */
export const SUGESTOES_DIAS = [0, 30, 90, 180, 365]
