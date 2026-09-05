import { describe, expect, it } from "vitest"
import {
  agruparComissoes,
  calcularComissao,
  emCentavos,
  explicarComissao,
  ISS_PADRAO,
  MAX_PERCENTUAL,
  percentualValido,
} from "@/lib/comissao"

// A conta da comissão, sem banco.
//
// Este número vai para o contas a pagar de uma pessoa real e vai ser conferido
// por ela. Cada caso aqui é uma conversa que o dono não vai precisar ter.

const base = {
  totalCentavos: 120000, // R$ 1.200,00
  percentual: 10,
  issRate: 5,
  descontarIss: false,
}

describe("a conta", () => {
  it("sem nota, incide sobre o total cheio", () => {
    // "assim que a ordem de serviço for concluída, já adicionar no contas a
    // pagar a porcentagem do funcionário" — nesse momento não há nota nenhuma.
    const c = calcularComissao(base)!
    expect(c.issCentavos).toBe(0)
    expect(c.baseCentavos).toBe(120000)
    expect(c.valorCentavos).toBe(12000) // R$ 120,00
  })

  it("com nota, desconta o imposto ANTES da porcentagem", () => {
    // "se for faturada também, porém, descontar a taxa da nota fiscal."
    // A empresa nunca teve o dinheiro do ISS, então ele não entra na base.
    const c = calcularComissao({ ...base, descontarIss: true })!
    expect(c.issCentavos).toBe(6000) // 5% de 1.200
    expect(c.baseCentavos).toBe(114000)
    expect(c.valorCentavos).toBe(11400) // 10% de 1.140 = R$ 114,00
  })

  it("usa a alíquota DA EMPRESA, não uma fixa", () => {
    // fiscalIssRate é por empresa (schema.prisma:52). Cravar 5% faria a conta
    // errar em toda cidade com alíquota diferente.
    const c = calcularComissao({ ...base, issRate: 2, descontarIss: true })!
    expect(c.issCentavos).toBe(2400)
    expect(c.valorCentavos).toBe(11760)
  })

  it("sem alíquota configurada, cai no padrão do emissor", () => {
    // O mesmo padrão que actions/nfse.ts usa ao emitir. Divergir aqui faria a
    // comissão descontar um imposto diferente do que foi recolhido.
    const c = calcularComissao({ ...base, issRate: null, descontarIss: true })!
    expect(ISS_PADRAO).toBe(5)
    expect(c.issCentavos).toBe(6000)
  })
})

describe("o centavo que sempre caía contra o funcionário", () => {
  it("15% de R$ 100,10 dá R$ 15,02, e não R$ 15,01", () => {
    // A conta exata é 15,015. A fórmula em reais — o jeito usado em
    // patrimonio.ts, correto lá — dá 15,014999… e arredonda para 15,01.
    const c = calcularComissao({
      totalCentavos: 10010,
      percentual: 15,
      issRate: null,
      descontarIss: false,
    })!
    expect(c.valorCentavos).toBe(1502)
    // E a prova de que a outra fórmula erraria:
    expect(Math.round(100.1 * (15 / 100) * 100)).toBe(1501)
  })

  it("o erro nunca é a favor do funcionário — é sempre a menos", () => {
    // Varredura de R$ 0,01 a R$ 2.000,00 contra oito porcentagens usuais.
    // Não é ruído aleatório: é viés, e viés de um centavo por OS contra a
    // mesma pessoa é o tipo de erro que ela encontra.
    const pcts = [5, 7.5, 10, 12, 15, 20, 25, 30]
    let divergencias = 0
    let aFavorDoFuncionario = 0

    for (let centavos = 1; centavos <= 200000; centavos++) {
      for (const p of pcts) {
        const viaReais = Math.round((centavos / 100) * (p / 100) * 100)
        const viaCentavos = Math.round((centavos * p) / 100)
        if (viaReais !== viaCentavos) {
          divergencias++
          if (viaReais > viaCentavos) aFavorDoFuncionario++
        }
      }
    }

    expect(divergencias).toBe(12020)
    expect(aFavorDoFuncionario).toBe(0)
  })
})

describe("quando NÃO existe comissão", () => {
  it("porcentagem nula quer dizer 'esta OS não comissiona'", () => {
    // Nulo é diferente de zero, e é o que permite ligar o recurso sem mexer em
    // nenhuma OS já existente.
    expect(calcularComissao({ ...base, percentual: null })).toBeNull()
  })

  it("porcentagem zero também não gera linha", () => {
    // Uma conta a pagar de R$ 0,00 é ruído que o dono confere todo mês à toa.
    expect(calcularComissao({ ...base, percentual: 0 })).toBeNull()
  })

  it("OS sem valor não gera comissão", () => {
    expect(calcularComissao({ ...base, totalCentavos: 0 })).toBeNull()
  })

  it("total NEGATIVO não vira conta cobrando do funcionário", () => {
    // Não deveria existir, mas se existir o certo é não pagar — e não gravar um
    // valor negativo, que no contas a pagar viraria uma cobrança à pessoa.
    expect(calcularComissao({ ...base, totalCentavos: -5000 })).toBeNull()
  })

  it("valor pequeno demais que arredondaria para zero não vira linha", () => {
    // 1% de R$ 0,04 dá 0,0004 → zero. Gravar R$ 0,00 seria pior que não gravar.
    const c = calcularComissao({
      totalCentavos: 4,
      percentual: 1,
      issRate: null,
      descontarIss: false,
    })
    expect(c).toBeNull()
  })

  it("porcentagem inválida não passa", () => {
    for (const p of [-1, 101, NaN, Infinity]) {
      expect(calcularComissao({ ...base, percentual: p }), String(p)).toBeNull()
    }
  })
})

describe("faturada não é a mesma coisa que ter nota", () => {
  it("o desconto depende da NOTA, não do status", () => {
    // O status FATURADA é alcançável sem emitir nota nenhuma — é o caso mais
    // comum de quem cobra sem nota. Descontar ISS ali tiraria dinheiro do
    // funcionário para pagar um imposto que ninguém recolheu.
    const semNota = calcularComissao({ ...base, descontarIss: false })!
    const comNota = calcularComissao({ ...base, descontarIss: true })!

    expect(semNota.issCentavos).toBe(0)
    expect(comNota.issCentavos).toBeGreaterThan(0)
    expect(semNota.valorCentavos).toBeGreaterThan(comNota.valorCentavos)
  })
})

describe("a explicação que vai na descrição da despesa", () => {
  it("mostra a base e a porcentagem, para a pessoa refazer a conta", () => {
    // "Comissão — R$ 114,00" não deixa ninguém conferir nada, e conferir é
    // exatamente o que acontece quando a pessoa recebe menos do que esperava.
    const c = calcularComissao({ ...base, descontarIss: true })!
    const texto = explicarComissao(c, 10)

    expect(texto).toContain("10%")
    expect(texto).toContain("1.140,00")
    expect(texto).toContain("1.200,00")
    expect(texto).toContain("60,00")
  })

  it("sem imposto, não inventa desconto na explicação", () => {
    const c = calcularComissao(base)!
    const texto = explicarComissao(c, 10)
    expect(texto).toContain("1.200,00")
    expect(texto).not.toContain("imposto")
  })

  it("porcentagem quebrada aparece como a pessoa digitou", () => {
    const c = calcularComissao({ ...base, percentual: 7.5 })!
    expect(explicarComissao(c, 7.5)).toContain("7,5%")
  })
})

describe("detalhes", () => {
  it("reais viram centavos sem sobra binária", () => {
    expect(emCentavos(100.1)).toBe(10010)
    expect(emCentavos(0.07)).toBe(7)
    expect(emCentavos(1234.56)).toBe(123456)
  })

  it("o teto de porcentagem é 100", () => {
    expect(MAX_PERCENTUAL).toBe(100)
    expect(percentualValido(100)).toBe(true)
    expect(percentualValido(100.01)).toBe(false)
    // Nulo é válido: quer dizer "não comissiona".
    expect(percentualValido(null)).toBe(true)
  })

  it("a soma fecha: imposto + base = total", () => {
    // A invariante que impede a conta de vazar centavo em qualquer alíquota.
    for (const total of [10010, 33333, 99999, 1, 7, 123456]) {
      for (const iss of [2, 3, 5, 7.5]) {
        const c = calcularComissao({
          totalCentavos: total,
          percentual: 10,
          issRate: iss,
          descontarIss: true,
        })
        if (!c) continue
        expect(c.issCentavos + c.baseCentavos).toBe(c.totalCentavos)
      }
    }
  })
})

describe("as comissões agrupadas por pessoa", () => {
  const linha = (payeeId: string, nome: string, valor: number, base = 0, iss = 0) => ({
    payeeId,
    nome,
    valor,
    base,
    iss,
  })

  it("soma as OS de cada pessoa numa linha só", () => {
    // Quatro técnicos com vinte OS no mês são oitenta linhas novas numa tabela
    // sem paginação — o dono deixaria de achar o aluguel no meio delas.
    const r = agruparComissoes([
      linha("ana", "Ana", 120, 1200),
      linha("ana", "Ana", 80, 800),
      linha("bruno", "Bruno", 50, 500),
    ])

    expect(r).toHaveLength(2)
    const ana = r.find((x) => x.payeeId === "ana")!
    expect(ana.quantidade).toBe(2)
    expect(ana.total).toBe(200)
    expect(ana.base).toBe(2000)
  })

  it("ordena do maior para o menor", () => {
    // É onde o dono olha primeiro.
    const r = agruparComissoes([linha("a", "A", 10), linha("b", "B", 90), linha("c", "C", 50)])
    expect(r.map((x) => x.payeeId)).toEqual(["b", "c", "a"])
  })

  it("soma centavos sem sobra binária", () => {
    // Somando reais direto, 0,1 + 0,2 daria 0,30000000000000004 — e o total da
    // pessoa passaria a diferir da soma das linhas que ela vê na tabela.
    const r = agruparComissoes([linha("a", "A", 0.1), linha("a", "A", 0.2)])
    expect(r[0].total).toBe(0.3)
  })

  it("sem comissão nenhuma, devolve lista vazia", () => {
    // A tela usa isto para não mostrar um cartão vazio a quem não comissiona.
    expect(agruparComissoes([])).toEqual([])
  })

  it("soma o imposto separado do valor", () => {
    // "Quanto de ISS saiu das comissões deste mês" é a pergunta do primeiro
    // fechamento.
    const r = agruparComissoes([
      linha("a", "A", 114, 1140, 60),
      linha("a", "A", 57, 570, 30),
    ])
    expect(r[0].iss).toBe(90)
    expect(r[0].total).toBe(171)
  })
})
