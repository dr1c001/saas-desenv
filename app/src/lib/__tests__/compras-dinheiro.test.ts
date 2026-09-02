import { describe, expect, it } from "vitest"
import {
  custoMedio,
  dividirEmParcelas,
  quantoComprar,
  sugerirCompra,
} from "@/lib/compras-dinheiro"

// O lado financeiro da compra.
//
// Até 01/09/2026 a compra entrava no estoque e NÃO saía do caixa: a empresa
// comprava R$ 2.400 em peças, o saldo subia, e o Financeiro não ficava sabendo.
// O lucro na tela era maior que o lucro de verdade.

describe("custo médio ponderado", () => {
  it("é a média pesada pelas quantidades", () => {
    // O defeito que substitui: o custo era SOBRESCRITO pela última compra.
    // 10 a R$ 80 mais 2 a R$ 120 dá R$ 86,67 — e não R$ 120, que era o que o
    // sistema passava a usar para calcular margem de um estoque que custou
    // outra coisa.
    expect(
      custoMedio({ estoqueAtual: 10, custoAtual: 80, quantidadeRecebida: 2, custoDaCompra: 120 })
    ).toBe(86.67)
  })

  it("com o estoque zerado, vale o custo da compra nova", () => {
    // Média com um custo antigo que não representa mais nada em prateleira
    // nenhuma seria inventar um número.
    expect(
      custoMedio({ estoqueAtual: 0, custoAtual: 80, quantidadeRecebida: 5, custoDaCompra: 120 })
    ).toBe(120)
  })

  it("peça nova, sem custo anterior, vale o da compra", () => {
    expect(
      custoMedio({ estoqueAtual: 0, custoAtual: null, quantidadeRecebida: 5, custoDaCompra: 42.5 })
    ).toBe(42.5)
  })

  it("estoque NEGATIVO não produz média sem sentido", () => {
    // Acontece quando a baixa chegou antes da entrada. Ponderar por quantidade
    // negativa daria um custo negativo ou absurdo, que contaminaria a margem.
    expect(
      custoMedio({ estoqueAtual: -3, custoAtual: 80, quantidadeRecebida: 5, custoDaCompra: 120 })
    ).toBe(120)
  })

  it("receber zero não muda o custo", () => {
    expect(
      custoMedio({ estoqueAtual: 10, custoAtual: 80, quantidadeRecebida: 0, custoDaCompra: 999 })
    ).toBe(80)
  })

  it("fecha em centavos", () => {
    const c = custoMedio({
      estoqueAtual: 3, custoAtual: 10, quantidadeRecebida: 3, custoDaCompra: 20,
    })
    expect(c).toBe(15)
    expect(Number.isInteger(c * 100)).toBe(true)
  })
})

describe("parcelas", () => {
  const jan = new Date("2026-01-10T12:00:00Z")

  it("uma parcela é o valor inteiro", () => {
    const p = dividirEmParcelas(2400, 1, jan)
    expect(p).toHaveLength(1)
    expect(p[0].valor).toBe(2400)
  })

  it("a soma das parcelas é SEMPRE o total", () => {
    // O teste que importa. R$ 100 em 3 arredondado dá 33,33 três vezes = 99,99,
    // e o centavo perdido reaparece meses depois como diferença inexplicável
    // na conciliação.
    for (const [total, n] of [[100, 3], [2400, 7], [0.05, 3], [1234.56, 11]] as const) {
      const soma = dividirEmParcelas(total, n, jan).reduce((s, p) => s + p.valor, 0)
      expect(Math.round(soma * 100) / 100, `${total} em ${n}x`).toBe(total)
    }
  })

  it("a sobra vai na PRIMEIRA parcela", () => {
    // Como banco e boleto fazem: 33,34 + 33,33 + 33,33.
    const p = dividirEmParcelas(100, 3, jan)
    expect(p.map((x) => x.valor)).toEqual([33.34, 33.33, 33.33])
  })

  it("vence de mês em mês, a partir da data informada", () => {
    const p = dividirEmParcelas(300, 3, jan)
    expect(p.map((x) => x.vencimento.getUTCMonth())).toEqual([0, 1, 2])
  })

  it("atravessa a virada do ano", () => {
    const nov = new Date("2026-11-10T12:00:00Z")
    const p = dividirEmParcelas(300, 3, nov)
    expect(p.map((x) => x.vencimento.getUTCFullYear())).toEqual([2026, 2026, 2027])
  })

  it("quantidade inválida vira uma parcela", () => {
    // Campo mal preenchido não pode gerar zero parcela — a despesa sumiria.
    for (const n of [0, -3, 0.5, NaN]) {
      expect(dividirEmParcelas(500, n, jan), String(n)).toHaveLength(1)
    }
  })
})

describe("quanto comprar", () => {
  it("o que falta para chegar ao mínimo", () => {
    expect(quantoComprar(2, 5)).toBe(3)
  })

  it("no mínimo ou acima, não sugere nada", () => {
    // Sugestão que propõe comprar quem não precisa vira ruído, e lista com
    // ruído é lista que ninguém abre.
    expect(quantoComprar(5, 5)).toBe(0)
    expect(quantoComprar(9, 5)).toBe(0)
  })

  it("estoque NEGATIVO conta a favor", () => {
    // Faltando 3 com mínimo 5, o que falta comprar são 8 — não 5.
    expect(quantoComprar(-3, 5)).toBe(8)
  })

  it("sem mínimo definido, não sugere", () => {
    // `minStock: 0` é o padrão de quem nunca configurou. Sugerir compra para
    // essas peças encheria a lista com o catálogo inteiro.
    expect(quantoComprar(0, 0)).toBe(0)
    expect(quantoComprar(-2, 0)).toBe(0)
  })
})

describe("a lista de sugestão", () => {
  const pecas = [
    { id: "a", nome: "Filtro", estoque: 4, minimo: 5, custo: 10 },
    { id: "b", nome: "Compressor", estoque: -2, minimo: 3, custo: 900 },
    { id: "c", nome: "Gás", estoque: 20, minimo: 5, custo: 300 },
    { id: "d", nome: "Sem mínimo", estoque: 0, minimo: 0, custo: 5 },
  ]

  it("traz só o que precisa de compra", () => {
    expect(sugerirCompra(pecas).map((p) => p.id)).toEqual(["b", "a"])
  })

  it("ordena pelo que está MAIS faltando", () => {
    // Quem abre esta lista quer resolver o pior caso primeiro, e não navegar
    // por ordem alfabética.
    const r = sugerirCompra(pecas)
    expect(r[0].nome).toBe("Compressor")
    expect(r[0].comprar).toBe(5)
    expect(r[1].comprar).toBe(1)
  })

  it("lista vazia não quebra", () => {
    expect(sugerirCompra([])).toEqual([])
  })

  it("nada faltando devolve lista vazia", () => {
    expect(sugerirCompra([{ id: "x", nome: "Ok", estoque: 10, minimo: 2, custo: 1 }])).toEqual([])
  })
})
