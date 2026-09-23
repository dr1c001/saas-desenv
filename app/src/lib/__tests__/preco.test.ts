import { describe, expect, it } from "vitest"
import { precoCheio, precoCobrado } from "@/lib/preco"

// Isto é DINHEIRO saindo da conta de alguém. Erro aqui não dá erro em lugar
// nenhum: gera uma cobrança errada, que só aparece na fatura do cliente.

const PLANO = { priceMonthly: 197, priceYearly: 1970 }

describe("preço cheio", () => {
  it("sem combinado, vale a tabela", () => {
    expect(precoCheio(PLANO, null, "MONTHLY")).toBe(197)
    expect(precoCheio(PLANO, null, "YEARLY")).toBe(1970)
  })

  it("o combinado substitui a tabela", () => {
    // O defeito que este módulo corrige: o campo existia, o painel gravava, e
    // a cobrança continuava usando o preço do plano.
    expect(precoCheio(PLANO, 149, "MONTHLY")).toBe(149)
  })

  it("anual do combinado é doze vezes, SEM o desconto da tabela", () => {
    // O desconto anual ("pague 10, leve 12") é política do plano. Aplicá-lo por
    // cima de um valor já negociado daria dois descontos, e quem negociou o
    // primeiro não estava contando com o segundo.
    expect(precoCheio(PLANO, 149, "YEARLY")).toBe(1788)
    expect(precoCheio(PLANO, 149, "YEARLY")).not.toBe(149 * 10)
  })

  it("combinado de zero é de graça, e não 'sem combinado'", () => {
    // Cortesia, período de teste negociado, sócio. Se zero caísse no plano, a
    // empresa que combinou isenção seria cobrada.
    expect(precoCheio(PLANO, 0, "MONTHLY")).toBe(0)
    expect(precoCheio(PLANO, 0, "YEARLY")).toBe(0)
  })

  it("combinado corrompido cai na tabela em vez de cobrar errado", () => {
    expect(precoCheio(PLANO, -50, "MONTHLY")).toBe(197)
  })

  it("arredonda para centavos", () => {
    expect(precoCheio({ priceMonthly: 33.333, priceYearly: 400 }, null, "MONTHLY")).toBe(33.33)
  })
})

describe("preço cobrado, já com o desconto de indicação", () => {
  it("aplica o desconto sobre a tabela", () => {
    expect(precoCobrado(PLANO, null, "MONTHLY", 10)).toBe(177.3)
  })

  it("aplica o desconto sobre o COMBINADO, não sobre a tabela", () => {
    // Se caísse na tabela, o indicado com preço negociado receberia desconto
    // de um valor que ele não ia pagar.
    expect(precoCobrado(PLANO, 149, "MONTHLY", 10)).toBe(134.1)
  })

  it("sem desconto, é o preço cheio", () => {
    expect(precoCobrado(PLANO, 149, "MONTHLY", 0)).toBe(149)
  })

  it("não sobra resto de ponto flutuante no payload", () => {
    // 197 * 0,8 = 157.60000000000002 em ponto flutuante. Mandar isso cru numa
    // API de pagamento não é prática correta de dinheiro.
    const v = precoCobrado(PLANO, null, "MONTHLY", 20)
    expect(v).toBe(157.6)
    expect(String(v)).not.toMatch(/\d{6,}/)
  })

  it("desconto fora da faixa não vira cobrança negativa", () => {
    // Valor negativo seria a plataforma PAGANDO o cliente.
    expect(precoCobrado(PLANO, null, "MONTHLY", 150)).toBe(0)
    expect(precoCobrado(PLANO, null, "MONTHLY", -10)).toBe(197)
    expect(precoCobrado(PLANO, null, "MONTHLY", NaN)).toBe(197)
  })
})
