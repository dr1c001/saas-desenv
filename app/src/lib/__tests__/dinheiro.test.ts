import { describe, expect, it } from "vitest"
import { lerDinheiro, paraCampo } from "@/lib/dinheiro"

// O defeito que este arquivo guarda:
//
// O formulário preenchia o campo com o número cru do banco ("12.5") e a Action
// tratava todo ponto como milhar. Abrir a peça de R$ 12,50, não tocar em nada e
// salvar gravava R$ 125,00 — dez vezes mais, em silêncio. Com "0,75", cem.
//
// Estava em quatro Actions diferentes, duas delas escritas no mesmo dia.

describe("o ponto que vinha da tela", () => {
  it("uma ou duas casas depois do ponto é DECIMAL, e não milhar", () => {
    // Esta é a linha que impedia o estrago. "12.5" é o que o input mostrava
    // quando o banco tinha 12,50.
    expect(lerDinheiro("12.5")).toBe(12.5)
    expect(lerDinheiro("12.50")).toBe(12.5)
    expect(lerDinheiro("0.75")).toBe(0.75)
    expect(lerDinheiro("1250.9")).toBe(1250.9)
    expect(lerDinheiro("8.99")).toBe(8.99)
  })

  it("três casas depois do ponto é MILHAR, que é o jeito brasileiro", () => {
    expect(lerDinheiro("1.234")).toBe(1234)
    expect(lerDinheiro("15.000")).toBe(15000)
  })

  it("mais de um ponto é sempre milhar", () => {
    expect(lerDinheiro("1.234.567")).toBe(1234567)
  })
})

describe("o jeito brasileiro de escrever", () => {
  it("a vírgula manda: com ela, todo ponto é milhar", () => {
    expect(lerDinheiro("1.234,56")).toBe(1234.56)
    expect(lerDinheiro("12,50")).toBe(12.5)
    expect(lerDinheiro("1.000.000,01")).toBe(1000000.01)
  })

  it("aceita o cifrão e o espaço que a pessoa cola junto", () => {
    expect(lerDinheiro("R$ 40,00")).toBe(40)
    expect(lerDinheiro("r$1.234,56")).toBe(1234.56)
    expect(lerDinheiro(" 40 ")).toBe(40)
  })

  it("número inteiro continua inteiro", () => {
    expect(lerDinheiro("100")).toBe(100)
    expect(lerDinheiro("0")).toBe(0)
  })
})

describe("o que não é dinheiro", () => {
  it("vazio é null, e não zero", () => {
    // Zero mentiria: "não informou" e "informou zero" são coisas diferentes.
    expect(lerDinheiro("")).toBeNull()
    expect(lerDinheiro("   ")).toBeNull()
    expect(lerDinheiro(null)).toBeNull()
    expect(lerDinheiro(undefined)).toBeNull()
  })

  it("letra é null", () => {
    expect(lerDinheiro("abc")).toBeNull()
    expect(lerDinheiro("12abc")).toBeNull()
    expect(lerDinheiro("R$")).toBeNull()
  })

  it("duas vírgulas não é número", () => {
    expect(lerDinheiro("1,2,3")).toBeNull()
  })
})

describe("negativo", () => {
  it("passa, porque conta retificadora existe", () => {
    // "(-) Provisão para perdas" é linha legítima do balanço. Recusar aqui
    // obrigaria a empresa a mentir para caber na regra do sistema.
    expect(lerDinheiro("-2000")).toBe(-2000)
    expect(lerDinheiro("-1.234,56")).toBe(-1234.56)
  })
})

describe("o que o CAMPO mostra", () => {
  it("sai em português, sempre com vírgula", () => {
    // É a outra metade do conserto: com o campo saindo em vírgula, o leitor
    // nunca mais precisa adivinhar o que um ponto significa.
    expect(paraCampo(12.5)).toBe("12,50")
    expect(paraCampo(1234.56)).toBe("1.234,56")
    expect(paraCampo(40)).toBe("40,00")
  })

  it("vazio para não informado", () => {
    expect(paraCampo(null)).toBe("")
    expect(paraCampo(undefined)).toBe("")
  })

  it("IDA E VOLTA: o que o campo mostra, o parser lê de volta igual", () => {
    // A propriedade que fecha o buraco. Se um dia alguém trocar o formato do
    // campo sem trocar o parser, este teste quebra antes de o dinheiro mudar.
    for (const n of [12.5, 0.75, 1234.56, 40, 0, 1000000.01, 8.99, -2000]) {
      expect(lerDinheiro(paraCampo(n)), `ida e volta de ${n}`).toBe(n)
    }
  })
})
