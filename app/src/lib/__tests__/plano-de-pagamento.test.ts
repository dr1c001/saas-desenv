import { describe, expect, it } from "vitest"
import {
  MAX_PARCELAS,
  montarPlano,
  problemaNoPlano,
  rotuloDaParcela,
  somaDoPlano,
} from "@/lib/plano-de-pagamento"

// Entrada à vista mais saldo a prazo.
//
// O caso do dono, literal: "o serviço ficou R$ 2.000, o cliente paga R$ 500 à
// vista e pede prazo para 7 dias após a execução. Tem cliente que pede 7, ou
// 15, ou 30 dias."
//
// Cada centavo aqui vira boleto na mão de um cliente.

const execucao = new Date("2026-09-10T12:00:00Z")
const dia = 24 * 60 * 60 * 1000

describe("o caso que o dono descreveu", () => {
  it("R$ 2.000 com R$ 500 de entrada e prazo de 7 dias", () => {
    const p = montarPlano({ total: 2000, entrada: 500, parcelas: 1, prazoDias: 7 }, execucao)

    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ numero: 0, valor: 500, entrada: true })
    expect(p[0].vencimento).toEqual(execucao)
    expect(p[1]).toMatchObject({ numero: 1, valor: 1500, entrada: false })
    // Sete dias APÓS A EXECUÇÃO, e não após o lançamento no sistema.
    expect(p[1].vencimento.getTime()).toBe(execucao.getTime() + 7 * dia)
  })

  it("o mesmo serviço com prazo de 15 e de 30 dias", () => {
    for (const prazo of [15, 30]) {
      const p = montarPlano({ total: 2000, entrada: 500, parcelas: 1, prazoDias: prazo }, execucao)
      expect(p[1].vencimento.getTime(), String(prazo)).toBe(execucao.getTime() + prazo * dia)
    }
  })

  it("o saldo em três vezes espaça de 15 em 15 dias", () => {
    // Cada parcela conta da EXECUÇÃO: 15, 30 e 45 dias — e não 15 dias a partir
    // da anterior, que daria as mesmas datas mas por raciocínio errado quando
    // alguém mexer no primeiro vencimento.
    const p = montarPlano({ total: 2000, entrada: 500, parcelas: 3, prazoDias: 15 }, execucao)

    expect(p).toHaveLength(4)
    expect(p[1].vencimento.getTime()).toBe(execucao.getTime() + 15 * dia)
    expect(p[2].vencimento.getTime()).toBe(execucao.getTime() + 30 * dia)
    expect(p[3].vencimento.getTime()).toBe(execucao.getTime() + 45 * dia)
  })
})

describe("a soma fecha — é o que o cliente confere somando os boletos", () => {
  it("com divisão exata", () => {
    const p = montarPlano({ total: 2000, entrada: 500, parcelas: 3, prazoDias: 7 }, execucao)
    expect(somaDoPlano(p)).toBe(2000)
  })

  it("com centavo quebrado, e ele vai para a PRIMEIRA parcela", () => {
    // R$ 1.000 em 3x dá 333,333... O centavo que sobra tem de ir para alguém, e
    // vai para a primeira: mesma convenção da compra parcelada, e o cliente
    // paga o quebrado logo em vez de estranhar no fim.
    const p = montarPlano({ total: 1000, entrada: 0, parcelas: 3, prazoDias: 30 }, execucao)

    expect(p.map((x) => x.valor)).toEqual([333.34, 333.33, 333.33])
    expect(somaDoPlano(p)).toBe(1000)
  })

  it("fecha em toda combinação plausível", () => {
    // Varredura: é o defeito que este tipo de conta convida, e ele só aparece
    // em valor quebrado com número de parcelas que não divide redondo.
    for (let centavos = 1; centavos <= 5000; centavos++) {
      const total = centavos / 100
      for (const n of [1, 2, 3, 6, 12]) {
        const p = montarPlano({ total, entrada: 0, parcelas: n, prazoDias: 30 }, execucao)
        expect(somaDoPlano(p), `${total} em ${n}x`).toBe(total)
      }
    }
  })

  it("fecha também com entrada quebrada", () => {
    const p = montarPlano({ total: 2000, entrada: 333.33, parcelas: 3, prazoDias: 7 }, execucao)
    expect(somaDoPlano(p)).toBe(2000)
  })
})

describe("sem entrada", () => {
  it("não cria linha de entrada zerada", () => {
    // Uma parcela de R$ 0,00 no contas a receber é ruído que o dono confere
    // todo mês para nada.
    const p = montarPlano({ total: 900, entrada: 0, parcelas: 3, prazoDias: 30 }, execucao)

    expect(p).toHaveLength(3)
    expect(p.every((x) => !x.entrada)).toBe(true)
  })
})

describe("o que é recusado", () => {
  const ok = { total: 2000, entrada: 500, parcelas: 3, prazoDias: 7 }

  it("entrada maior que o serviço", () => {
    expect(problemaNoPlano({ ...ok, entrada: 2500 })).toBe("entradaMaiorQueTotal")
  })

  it("entrada IGUAL ao serviço tem erro próprio", () => {
    // Não é tratado como "pagou à vista": quem abriu a tela de parcelamento
    // quis parcelar, e devolver silenciosamente uma parcela só esconderia o
    // engano de digitação.
    expect(problemaNoPlano({ ...ok, entrada: 2000 })).toBe("semSaldoAParcelar")
  })

  it("entrada negativa", () => {
    expect(problemaNoPlano({ ...ok, entrada: -1 })).toBe("entradaNegativa")
  })

  it("serviço sem valor", () => {
    expect(problemaNoPlano({ ...ok, total: 0 })).toBe("totalInvalido")
  })

  it("parcelas fora da faixa", () => {
    expect(problemaNoPlano({ ...ok, parcelas: 0 })).toBe("parcelasInvalidas")
    expect(problemaNoPlano({ ...ok, parcelas: MAX_PARCELAS + 1 })).toBe("parcelasInvalidas")
    expect(problemaNoPlano({ ...ok, parcelas: NaN })).toBe("parcelasInvalidas")
  })

  it("prazo fora da faixa", () => {
    expect(problemaNoPlano({ ...ok, prazoDias: 0 })).toBe("prazoInvalido")
    expect(problemaNoPlano({ ...ok, prazoDias: 400 })).toBe("prazoInvalido")
  })

  it("montar um plano inválido LANÇA, em vez de devolver lista vazia", () => {
    // Lista vazia faria a receita da OS sumir em silêncio na hora de gravar —
    // a ação apaga as pendentes antes de criar as novas.
    expect(() => montarPlano({ ...ok, entrada: 9999 }, execucao)).toThrow()
  })
})

describe("o rótulo que o cliente lê", () => {
  it("diz entrada, e diz quantas faltam", () => {
    const p = montarPlano({ total: 2000, entrada: 500, parcelas: 3, prazoDias: 7 }, execucao)
    expect(rotuloDaParcela(p[0], 3)).toBe("entrada")
    expect(rotuloDaParcela(p[1], 3)).toBe("1/3")
    expect(rotuloDaParcela(p[3], 3)).toBe("3/3")
  })
})

describe("os prazos longos que o cliente pede", () => {
  it("30/60/90 são três parcelas com prazo de 30 dias", () => {
    // "tem cliente que vai querer pagar em 30, 60, 90 dias". O campo é o
    // INTERVALO entre parcelas; três parcelas de 30 dias dão exatamente essas
    // datas, contadas da execução.
    const p = montarPlano({ total: 3000, entrada: 0, parcelas: 3, prazoDias: 30 }, execucao)

    expect(p.map((x) => Math.round((x.vencimento.getTime() - execucao.getTime()) / dia))).toEqual([
      30, 60, 90,
    ])
    expect(somaDoPlano(p)).toBe(3000)
  })

  it("com entrada, vira à vista mais 30/60/90", () => {
    const p = montarPlano({ total: 4000, entrada: 1000, parcelas: 3, prazoDias: 30 }, execucao)

    expect(p.map((x) => Math.round((x.vencimento.getTime() - execucao.getTime()) / dia))).toEqual([
      0, 30, 60, 90,
    ])
    expect(p.map((x) => x.valor)).toEqual([1000, 1000, 1000, 1000])
  })

  it("uma parcela só de 60 ou de 90 dias também vale", () => {
    // O cliente que não parcela, só pede prazo maior.
    for (const prazo of [60, 90, 120]) {
      const p = montarPlano({ total: 2000, entrada: 0, parcelas: 1, prazoDias: prazo }, execucao)
      expect(Math.round((p[0].vencimento.getTime() - execucao.getTime()) / dia), String(prazo)).toBe(
        prazo
      )
    }
  })

  it("um ano inteiro ainda é aceito; mais que isso, não", () => {
    // O teto existe para pegar engano de digitação (3000 no lugar de 30), e não
    // para julgar o combinado comercial.
    expect(problemaNoPlano({ total: 100, entrada: 0, parcelas: 1, prazoDias: 365 })).toBeNull()
    expect(problemaNoPlano({ total: 100, entrada: 0, parcelas: 1, prazoDias: 366 })).toBe(
      "prazoInvalido"
    )
  })
})
