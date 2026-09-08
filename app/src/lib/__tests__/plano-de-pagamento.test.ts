import { describe, expect, it } from "vitest"
import {
  faltaParaFechar,
  MAX_PARCELAS,
  montarPlano,
  problemaNasParcelas,
  problemaNoPlano,
  rotularParcelas,
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
    expect(rotularParcelas(p, execucao)).toEqual(["entrada", "1/3", "2/3", "3/3"])
  })

  it("sem entrada, começa em 1", () => {
    const p = montarPlano({ total: 900, entrada: 0, parcelas: 3, prazoDias: 30 }, execucao)
    expect(rotularParcelas(p, execucao)).toEqual(["1/3", "2/3", "3/3"])
  })

  it("as numeradas contam só entre elas", () => {
    // "entrada, 2/4" faria o cliente procurar a parcela 1.
    const p = montarPlano({ total: 2000, entrada: 500, parcelas: 1, prazoDias: 7 }, execucao)
    expect(rotularParcelas(p, execucao)).toEqual(["entrada", "1/1"])
  })

  it("a entrada é derivada da DATA, e sobrevive à edição", () => {
    // Um sinalizador gravado na geração continuaria dizendo "entrada" numa
    // linha que a pessoa empurrou para dali a trinta dias.
    const empurrada = [
      { vencimento: new Date(execucao.getTime() + 30 * dia) },
      { vencimento: new Date(execucao.getTime() + 60 * dia) },
    ]
    expect(rotularParcelas(empurrada, execucao)).toEqual(["1/2", "2/2"])
  })

  it("a hora do dia não decide nada", () => {
    // A execução tem hora; o vencimento combinado, não. Comparar instante
    // faria a entrada deixar de ser entrada por causa de três horas.
    const deManha = [{ vencimento: new Date("2026-09-10T03:30:00Z") }]
    expect(rotularParcelas(deManha, execucao)).toEqual(["entrada"])
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

describe("qualquer data combinada", () => {
  // "a empresa combina qualquer data combinada para o pagamento". O gerador de
  // parcelas iguais espaçadas por um prazo resolve 7/15/30/60/90 e não resolve
  // isto — quem manda é a lista, e o gerador virou atalho para montá-la.
  const lista = (v: [number, number][]) =>
    v.map(([valor, dias]) => ({ valor, vencimento: new Date(execucao.getTime() + dias * dia) }))

  it("valores e datas irregulares passam, desde que SOMEM o serviço", () => {
    // R$ 500 à vista, R$ 800 no dia 35 e R$ 700 no dia 54 — nada disso é
    // intervalo fixo nem parcela igual.
    const p = lista([[500, 0], [800, 35], [700, 54]])
    expect(problemaNasParcelas(p, 2000, execucao)).toBeNull()
  })

  it("lista que soma MENOS é recusada", () => {
    // Deixaria dinheiro sem cobrar, e cada linha isolada parece plausível.
    expect(problemaNasParcelas(lista([[500, 0], [800, 30]]), 2000, execucao)).toBe("somaNaoBate")
  })

  it("lista que soma MAIS é recusada", () => {
    // Cobraria do cliente algo que ninguém combinou.
    expect(problemaNasParcelas(lista([[500, 0], [1800, 30]]), 2000, execucao)).toBe("somaNaoBate")
  })

  it("erra por UM CENTAVO e ainda é recusada", () => {
    // É o caso que passa despercebido numa conferência a olho.
    expect(problemaNasParcelas(lista([[999.99, 0], [1000, 30]]), 2000, execucao)).toBe("somaNaoBate")
    expect(problemaNasParcelas(lista([[1000, 0], [1000, 30]]), 2000, execucao)).toBeNull()
  })

  it("parcela sem valor não passa", () => {
    expect(problemaNasParcelas(lista([[0, 0], [2000, 30]]), 2000, execucao)).toBe("valorInvalido")
    expect(problemaNasParcelas(lista([[-100, 0], [2100, 30]]), 2000, execucao)).toBe("valorInvalido")
  })

  it("vencimento ANTES da execução não passa", () => {
    // Não se combina pagar um serviço antes de ele existir.
    expect(problemaNasParcelas(lista([[2000, -5]]), 2000, execucao)).toBe("dataInvalida")
  })

  it("mas o mesmo dia da execução passa", () => {
    // É a entrada à vista.
    expect(problemaNasParcelas(lista([[2000, 0]]), 2000, execucao)).toBeNull()
  })

  it("data inválida não passa", () => {
    const p = [{ valor: 2000, vencimento: new Date("nao-e-data") }]
    expect(problemaNasParcelas(p, 2000, execucao)).toBe("dataInvalida")
  })

  it("vencimento absurdamente longe é engano de digitação", () => {
    expect(problemaNasParcelas(lista([[2000, 365 * 4]]), 2000, execucao)).toBe("dataMuitoLonge")
    // Três anos ainda passa: prazo longo existe.
    expect(problemaNasParcelas(lista([[2000, 365 * 2]]), 2000, execucao)).toBeNull()
  })

  it("lista vazia não passa", () => {
    expect(problemaNasParcelas([], 2000, execucao)).toBe("semParcelas")
  })

  it("a tela sabe quanto falta para fechar", () => {
    expect(faltaParaFechar(lista([[500, 0], [800, 30]]), 2000)).toBe(700)
    expect(faltaParaFechar(lista([[500, 0], [1800, 30]]), 2000)).toBe(-300)
    expect(faltaParaFechar(lista([[2000, 0]]), 2000)).toBe(0)
  })
})
