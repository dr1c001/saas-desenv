// Quanto esta empresa paga.
//
// Existe porque o plano customizado precisa de preço próprio: liberar recursos
// e ajustar tetos para uma empresa e continuar cobrando a tabela é dar o
// combinado de graça.
//
// Módulo puro porque isto é DINHEIRO de verdade saindo da conta de alguém. Um
// erro aqui não dá erro em lugar nenhum: gera uma cobrança errada, que só
// aparece na fatura do cliente.

export type Ciclo = "MONTHLY" | "YEARLY"

/**
 * O preço cheio, antes de qualquer desconto.
 *
 * `customMensal` é a mensalidade combinada com esta empresa. Quando existe,
 * substitui a tabela — e o ANUAL vira doze vezes ela, sem desconto embutido.
 *
 * Essa última parte é decisão, não descuido: o desconto anual da tabela é uma
 * política do plano ("pague 10 meses, leve 12"). Aplicá-la por cima de um valor
 * já negociado daria ao cliente dois descontos, sendo que quem negociou o
 * primeiro não estava contando com o segundo. Se o combinado for anual com
 * desconto, o número combinado já é esse — dividido por doze no campo.
 */
export function precoCheio(
  plano: { priceMonthly: number; priceYearly: number },
  customMensal: number | null,
  ciclo: Ciclo
): number {
  if (customMensal !== null && customMensal >= 0) {
    return arredondar(ciclo === "YEARLY" ? customMensal * 12 : customMensal)
  }
  return arredondar(ciclo === "YEARLY" ? plano.priceYearly : plano.priceMonthly)
}

/**
 * O valor que vai para a cobrança, já com o desconto de indicação.
 *
 * Arredondado ANTES de virar payload: `cheio * (1 - n/100)` gera resto de ponto
 * flutuante para praticamente qualquer desconto diferente de 0 ou 50
 * (197 * 0,8 = 157.60000000000002), e mandar isso cru numa API de pagamento não
 * é prática correta de dinheiro, mesmo que a Asaas arredonde do lado dela.
 * (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
 */
export function precoCobrado(
  plano: { priceMonthly: number; priceYearly: number },
  customMensal: number | null,
  ciclo: Ciclo,
  descontoPercent: number
): number {
  const cheio = precoCheio(plano, customMensal, ciclo)
  // Desconto fora da faixa é dado corrompido. Cobrar valor negativo seria a
  // plataforma pagando o cliente; ignorar acima de 100 evita isso sem precisar
  // travar a contratação inteira.
  const d = Number.isFinite(descontoPercent) ? Math.min(Math.max(descontoPercent, 0), 100) : 0
  return arredondar(cheio * (1 - d / 100))
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}
