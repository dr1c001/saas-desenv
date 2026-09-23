import { describe, expect, it } from "vitest"
import {
  caixa,
  ehGrupoDoAtivo,
  imobilizadoLiquido,
  lerValorManual,
  montarBalanco,
  type LinhaManual,
  type NumerosDaEmpresa,
} from "@/lib/balanco"

const zerado: NumerosDaEmpresa = {
  caixaInicial: 0,
  recebido: 0,
  pago: 0,
  aReceber: 0,
  aPagar: 0,
  estoque: 0,
  imobilizadoBruto: 0,
  depreciacao: 0,
  capitalSocial: 0,
  manuais: [],
}

const com = (n: Partial<NumerosDaEmpresa>): NumerosDaEmpresa => ({ ...zerado, ...n })

/** A empresa do exemplo: caixa, recebíveis, estoque, uma van e contas a pagar. */
const polarClima = com({
  caixaInicial: 5000,
  recebido: 42000,
  pago: 31000,
  aReceber: 8500,
  aPagar: 6200,
  estoque: 3400,
  imobilizadoBruto: 60000,
  depreciacao: 12000,
  capitalSocial: 20000,
})

function total(b: ReturnType<typeof montarBalanco>, grupo: string) {
  return b.grupos.find((g) => g.grupo === grupo)!.total
}

describe("o caixa", () => {
  it("é o inicial mais o que entrou, menos o que saiu", () => {
    expect(caixa(com({ caixaInicial: 5000, recebido: 42000, pago: 31000 }))).toBe(16000)
  })

  it("FICA NEGATIVO, e isso é de propósito", () => {
    // Empresa que já existia antes do sistema e não informou o caixa inicial:
    // o sistema só conhece o movimento, e o movimento sozinho fica negativo.
    //
    // Travar em zero esconderia exatamente o defeito que o balanço existe para
    // mostrar, e o conferente não teria o que apontar.
    expect(caixa(com({ recebido: 1000, pago: 4000 }))).toBe(-3000)
  })

  it("arredonda em centavos", () => {
    expect(caixa(com({ recebido: 0.1, pago: 0.2 }))).toBe(-0.1)
  })
})

describe("o imobilizado", () => {
  it("é o bruto menos a depreciação", () => {
    expect(imobilizadoLiquido(com({ imobilizadoBruto: 60000, depreciacao: 12000 }))).toBe(48000)
  })

  it("aparece em DUAS linhas no balanço, e a depreciação vem negativa", () => {
    // É a forma que o contador espera ler. Só o líquido esconderia quanto o
    // bem já perdeu — que é metade da informação.
    const b = montarBalanco(polarClima)
    const grupo = b.grupos.find((g) => g.grupo === "ATIVO_NAO_CIRCULANTE")!
    expect(grupo.linhas.map((l) => [l.chave, l.valor])).toEqual([
      ["imobilizado", 60000],
      ["depreciacao", -12000],
    ])
    expect(grupo.total).toBe(48000)
  })
})

describe("a identidade", () => {
  it("Ativo = Passivo + Patrimônio Líquido", () => {
    const b = montarBalanco(polarClima)
    expect(b.ativo).toBeCloseTo(b.passivo + b.patrimonioLiquido, 2)
    expect(b.fecha).toBe(true)
  })

  it("fecha com a empresa zerada", () => {
    const b = montarBalanco(zerado)
    expect(b.ativo).toBe(0)
    expect(b.passivo).toBe(0)
    expect(b.patrimonioLiquido).toBe(0)
    expect(b.fecha).toBe(true)
  })

  it("fecha mesmo com centavos quebrados em toda linha", () => {
    // Cada linha é arredondada antes de somar (convenção da nota fiscal). Somas
    // arredondadas por linha divergem da soma arredondada no fim — a tolerância
    // de um centavo existe por isso, e não para esconder erro de conta.
    const b = montarBalanco(
      com({
        recebido: 1000.005,
        pago: 333.335,
        aReceber: 66.665,
        estoque: 0.005,
        imobilizadoBruto: 99.995,
        depreciacao: 33.335,
        aPagar: 11.115,
      })
    )
    expect(b.fecha).toBe(true)
  })

  it("fecha com valores negativos nas manuais", () => {
    // Conta retificadora é legítima: provisão para devedores duvidosos entra
    // como valor negativo no ativo.
    const manuais: LinhaManual[] = [
      { grupo: "ATIVO_CIRCULANTE", descricao: "(-) Provisão para perdas", valor: -2000 },
    ]
    const b = montarBalanco(com({ ...polarClima, manuais }))
    expect(b.fecha).toBe(true)
    expect(total(b, "ATIVO_CIRCULANTE")).toBe(caixa(polarClima) + 8500 + 3400 - 2000)
  })
})

describe("o patrimônio líquido", () => {
  it("sai por diferença, e se decompõe em capital mais resultado", () => {
    const b = montarBalanco(polarClima)
    // Ativo: 16.000 caixa + 8.500 receber + 3.400 estoque + 48.000 imobilizado
    expect(b.ativo).toBe(75900)
    expect(b.passivo).toBe(6200)
    expect(b.patrimonioLiquido).toBe(69700)
    expect(b.capitalSocial).toBe(20000)
    expect(b.resultadoAcumulado).toBe(49700)
  })

  it("o resultado acumulado ABSORVE tudo quando não há capital informado", () => {
    // É o que faz a empresa parecer ter nascido do nada e lucrado tudo — e é
    // por isso que o conferente aponta capital social ausente.
    const b = montarBalanco(com({ ...polarClima, capitalSocial: 0 }))
    expect(b.resultadoAcumulado).toBe(69700)
  })

  it("linha manual de PL entra ANTES do resultado, e o resultado encolhe", () => {
    // Sem isso a reserva de lucros seria contada duas vezes: uma na linha
    // manual e outra dentro do resultado, e o PL não fecharia com o ativo.
    const manuais: LinhaManual[] = [
      { grupo: "PATRIMONIO_LIQUIDO", descricao: "Reserva de lucros", valor: 10000 },
    ]
    const b = montarBalanco(com({ ...polarClima, manuais }))
    expect(b.patrimonioLiquido).toBe(69700)
    expect(b.resultadoAcumulado).toBe(39700)
    expect(b.fecha).toBe(true)
  })

  it("fica NEGATIVO quando a empresa deve mais do que tem", () => {
    const b = montarBalanco(com({ caixaInicial: 1000, aPagar: 30000 }))
    expect(b.patrimonioLiquido).toBe(-29000)
    expect(b.fecha).toBe(true)
  })
})

describe("as linhas manuais", () => {
  it("caem no grupo que a empresa escolheu", () => {
    const manuais: LinhaManual[] = [
      { grupo: "PASSIVO_NAO_CIRCULANTE", descricao: "Financiamento da van", valor: 38000 },
      { grupo: "ATIVO_NAO_CIRCULANTE", descricao: "Imóvel da sede", valor: 250000 },
      { grupo: "PASSIVO_CIRCULANTE", descricao: "Empréstimo curto prazo", valor: 5000 },
    ]
    const b = montarBalanco(com({ manuais }))
    expect(total(b, "PASSIVO_NAO_CIRCULANTE")).toBe(38000)
    expect(total(b, "ATIVO_NAO_CIRCULANTE")).toBe(250000)
    expect(total(b, "PASSIVO_CIRCULANTE")).toBe(5000)
    expect(b.passivo).toBe(43000)
    expect(b.fecha).toBe(true)
  })

  it("vêm marcadas como NÃO automáticas, e guardam o id", () => {
    // A tela traduz a chave das automáticas e mostra o texto das manuais como
    // foi digitado; traduzir "Financiamento da van" devolveria a chave crua.
    const manuais: LinhaManual[] = [
      { id: "m1", grupo: "PASSIVO_NAO_CIRCULANTE", descricao: "Financiamento", valor: 38000 },
    ]
    const b = montarBalanco(com({ manuais }))
    const linha = b.grupos.find((g) => g.grupo === "PASSIVO_NAO_CIRCULANTE")!.linhas[0]
    expect(linha).toEqual({ chave: "Financiamento", valor: 38000, automatica: false, id: "m1" })
  })

  it("grupo vazio existe com total zero, e não some", () => {
    // A tela desenha os cinco grupos sempre: um balanço com o passivo faltando
    // parece um balanço quebrado.
    const b = montarBalanco(zerado)
    expect(b.grupos.map((g) => g.grupo)).toEqual([
      "ATIVO_CIRCULANTE",
      "ATIVO_NAO_CIRCULANTE",
      "PASSIVO_CIRCULANTE",
      "PASSIVO_NAO_CIRCULANTE",
      "PATRIMONIO_LIQUIDO",
    ])
  })
})

describe("qual grupo é ativo", () => {
  it("os dois do ativo, e só eles", () => {
    expect(ehGrupoDoAtivo("ATIVO_CIRCULANTE")).toBe(true)
    expect(ehGrupoDoAtivo("ATIVO_NAO_CIRCULANTE")).toBe(true)
    expect(ehGrupoDoAtivo("PASSIVO_CIRCULANTE")).toBe(false)
    expect(ehGrupoDoAtivo("PATRIMONIO_LIQUIDO")).toBe(false)
  })
})

describe("o valor digitado", () => {
  it("aceita o jeito brasileiro de escrever dinheiro", () => {
    expect(lerValorManual("1.250,50")).toBe(1250.5)
    expect(lerValorManual("38000")).toBe(38000)
  })

  it("aceita NEGATIVO, porque conta retificadora existe", () => {
    expect(lerValorManual("-2000")).toBe(-2000)
  })

  it("recusa o que não é número", () => {
    expect(lerValorManual("abc")).toBeNull()
    expect(lerValorManual("R$")).toBeNull()
  })

  it("campo VAZIO é null, e não zero", () => {
    // `Number("")` é 0. Aceitar isso gravaria uma linha de R$ 0,00 toda vez
    // que alguém salvasse sem preencher — lixo com nome no balanço, e nenhuma
    // mensagem dizendo o que faltou.
    expect(lerValorManual("")).toBeNull()
    expect(lerValorManual("   ")).toBeNull()
    expect(lerValorManual(null)).toBeNull()
    expect(lerValorManual(undefined)).toBeNull()
  })

  it("zero digitado de propósito continua valendo zero", () => {
    expect(lerValorManual("0")).toBe(0)
  })
})
