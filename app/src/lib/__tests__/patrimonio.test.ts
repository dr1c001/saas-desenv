import { describe, expect, it } from "vitest"
import {
  depreciacaoAcumulada,
  lerTaxa,
  mesesEntre,
  mesesRestantes,
  resumirPatrimonio,
  TAXA_ANUAL,
  taxaDoBem,
  valorContabil,
  valorDepreciavel,
  type Bem,
} from "@/lib/patrimonio"

// Os bens da empresa, e a depreciação.
//
// Os números daqui são GERENCIAIS — servem para o dono saber quanto vale o que
// tem e para entregar dado organizado ao contador. Mas "gerencial" não é
// desculpa para estar errado: um número que não bate com a tabela que o
// contador confere é pior que número nenhum, porque gera discussão.

const van = (over: Partial<Bem> = {}): Bem => ({
  categoria: "VEICULO",
  valorAquisicao: 60000,
  aquisicaoEm: new Date("2026-01-15T12:00:00Z"),
  situacao: "ATIVO",
  ...over,
})

const em = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe("as taxas padrão", () => {
  it("saem da tabela da Receita", () => {
    // Anexo III da IN RFB 1.700/2017 — a referência que o contador usa.
    expect(TAXA_ANUAL.VEICULO).toBe(20) // 5 anos
    expect(TAXA_ANUAL.INFORMATICA).toBe(20)
    expect(TAXA_ANUAL.MAQUINA).toBe(10) // 10 anos
    expect(TAXA_ANUAL.IMOVEL).toBe(4) // 25 anos
  })

  it("TERRENO não deprecia, e isso é regra e não arredondamento", () => {
    // Terreno não se desgasta e não tem vida útil. Um sistema que o
    // depreciasse estaria produzindo um número errado com confiança — e o
    // contador devolveria o balanço.
    expect(TAXA_ANUAL.TERRENO).toBe(0)
    const terreno = van({ categoria: "TERRENO", valorAquisicao: 200000 })
    expect(depreciacaoAcumulada(terreno, em("2046-01-15"))).toBe(0)
    expect(valorContabil(terreno, em("2046-01-15"))).toBe(200000)
  })

  it("o bem pode ter taxa própria", () => {
    // O contador pode ter motivo para usar outra, e o sistema não discute.
    expect(taxaDoBem(van({ taxaAnual: 25 }))).toBe(25)
  })

  it("taxa ZERO própria é respeitada, e não trocada pela padrão", () => {
    // `||` no lugar de `??` faria zero virar 20 — e o bem que a empresa
    // decidiu não depreciar passaria a depreciar sozinho.
    expect(taxaDoBem(van({ taxaAnual: 0 }))).toBe(0)
    expect(depreciacaoAcumulada(van({ taxaAnual: 0 }), em("2030-01-15"))).toBe(0)
  })

  it("taxa inválida cai na padrão", () => {
    expect(taxaDoBem(van({ taxaAnual: -5 }))).toBe(20)
    expect(taxaDoBem(van({ taxaAnual: null }))).toBe(20)
  })
})

describe("a depreciação", () => {
  it("é linear e mensal", () => {
    // Van de R$ 60.000 a 20% ao ano = R$ 12.000/ano = R$ 1.000/mês.
    const v = van()
    expect(depreciacaoAcumulada(v, em("2026-02-15"))).toBe(1000)
    expect(depreciacaoAcumulada(v, em("2026-07-15"))).toBe(6000)
    expect(depreciacaoAcumulada(v, em("2027-01-15"))).toBe(12000)
  })

  it("conta por MÊS, e não por dia", () => {
    // Depreciação no Brasil conta mês inteiro. Contar por dia daria números
    // que não batem com nenhuma tabela que o contador vai conferir.
    const compradoDia28 = van({ aquisicaoEm: em("2026-01-28") })
    expect(depreciacaoAcumulada(compradoDia28, em("2026-02-01"))).toBe(1000)
  })

  it("PARA quando o bem está totalmente depreciado", () => {
    // Depois de 5 anos a van vale zero nos livros. Continuar depreciando
    // produziria valor contábil NEGATIVO, que não existe.
    const v = van()
    expect(depreciacaoAcumulada(v, em("2031-01-15"))).toBe(60000)
    expect(depreciacaoAcumulada(v, em("2040-01-15"))).toBe(60000)
    expect(valorContabil(v, em("2040-01-15"))).toBe(0)
  })

  it("não deprecia antes de ser comprado", () => {
    // Lançamento retroativo digitado com data futura não pode gerar
    // depreciação negativa.
    expect(depreciacaoAcumulada(van(), em("2025-06-15"))).toBe(0)
  })

  it("respeita o valor residual", () => {
    // Van de R$ 60.000 com R$ 10.000 de residual: só R$ 50.000 depreciam.
    const v = van({ valorResidual: 10000 })
    expect(valorDepreciavel(v)).toBe(50000)
    expect(depreciacaoAcumulada(v, em("2031-01-15"))).toBe(50000)
    expect(valorContabil(v, em("2031-01-15"))).toBe(10000)
  })

  it("residual maior que o valor não vira depreciação negativa", () => {
    const v = van({ valorResidual: 99999 })
    expect(valorDepreciavel(v)).toBe(0)
    expect(depreciacaoAcumulada(v, em("2031-01-15"))).toBe(0)
  })
})

describe("bem baixado", () => {
  it("PARA de depreciar na data da baixa", () => {
    // Depois da baixa o bem não é mais da empresa. Continuar depreciando
    // inventaria despesa que não existe.
    const vendida = van({
      situacao: "BAIXADO",
      baixaEm: em("2026-07-15"),
    })
    expect(depreciacaoAcumulada(vendida, em("2026-07-15"))).toBe(6000)
    // Dois anos depois, o número é o MESMO.
    expect(depreciacaoAcumulada(vendida, em("2028-07-15"))).toBe(6000)
  })

  it("baixa sem data congela onde está", () => {
    const v = van({ situacao: "BAIXADO", baixaEm: null })
    expect(depreciacaoAcumulada(v, em("2026-07-15"))).toBe(6000)
  })

  it("EM MANUTENÇÃO continua depreciando", () => {
    // Bem parado para conserto continua sendo da empresa, e continua perdendo
    // valor — o desgaste não espera o conserto.
    const v = van({ situacao: "MANUTENCAO" })
    expect(depreciacaoAcumulada(v, em("2026-07-15"))).toBe(6000)
  })
})

describe("meses restantes de vida", () => {
  it("conta o que falta", () => {
    // Van a 20%/ano = 60 meses. Seis meses depois, faltam 54.
    expect(mesesRestantes(van(), em("2026-07-15"))).toBe(54)
  })

  it("nunca fica negativo", () => {
    expect(mesesRestantes(van(), em("2040-01-15"))).toBe(0)
  })

  it("o que não deprecia não tem fim", () => {
    expect(mesesRestantes(van({ categoria: "TERRENO" }), em("2030-01-15"))).toBeNull()
  })
})

describe("o resumo do patrimônio", () => {
  const bens: Bem[] = [
    van(),
    van({ categoria: "INFORMATICA", valorAquisicao: 5000 }),
    van({ categoria: "TERRENO", valorAquisicao: 200000 }),
  ]

  it("soma aquisição, depreciação e valor contábil", () => {
    const r = resumirPatrimonio(bens, em("2026-07-15"))
    expect(r.quantidade).toBe(3)
    expect(r.totalAquisicao).toBe(265000)
    // Van 6.000 + notebook 500 + terreno 0
    expect(r.totalDepreciado).toBe(6500)
    expect(r.totalContabil).toBe(258500)
  })

  it("bem BAIXADO fica de fora", () => {
    // Ele não é mais da empresa; somá-lo faria o ativo imobilizado contar
    // coisa vendida.
    const comBaixado = [...bens, van({ situacao: "BAIXADO", valorAquisicao: 99999 })]
    const r = resumirPatrimonio(comBaixado, em("2026-07-15"))
    expect(r.quantidade).toBe(3)
    expect(r.totalAquisicao).toBe(265000)
  })

  it("o contábil é sempre aquisição menos depreciado", () => {
    // A invariante do balanço: os três números têm de fechar entre si, senão
    // o ativo imobilizado não bate com nada.
    const r = resumirPatrimonio(bens, em("2029-03-15"))
    expect(r.totalContabil).toBeCloseTo(r.totalAquisicao - r.totalDepreciado, 2)
  })

  it("lista vazia dá tudo zero", () => {
    const r = resumirPatrimonio([], em("2026-07-15"))
    expect(r).toEqual({
      quantidade: 0,
      totalAquisicao: 0,
      totalDepreciado: 0,
      totalContabil: 0,
    })
  })
})

describe("meses entre datas", () => {
  it("conta meses de calendário", () => {
    expect(mesesEntre(em("2026-01-15"), em("2026-03-15"))).toBe(2)
  })

  it("atravessa o ano", () => {
    expect(mesesEntre(em("2026-11-01"), em("2027-02-01"))).toBe(3)
  })

  it("data anterior dá zero, e não negativo", () => {
    expect(mesesEntre(em("2026-06-01"), em("2026-01-01"))).toBe(0)
  })
})

describe("a taxa digitada", () => {
  it("aceita número válido", () => {
    expect(lerTaxa("15")).toBe(15)
    expect(lerTaxa(20)).toBe(20)
    expect(lerTaxa("0")).toBe(0)
  })

  it("vazio, letra, negativo e acima de 100 viram null", () => {
    // `null` = usa a padrão da categoria. Uma taxa de 500% depreciaria o bem
    // em dois meses e meio.
    for (const v of ["", "abc", -5, 101, null, undefined, NaN]) {
      expect(lerTaxa(v), String(v)).toBeNull()
    }
  })
})
