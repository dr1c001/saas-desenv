import { describe, expect, it } from "vitest"
import {
  dataDeCompetencia,
  dataDoResultado,
  dentroDoPeriodo,
  REGIME_PADRAO,
  regimeValido,
} from "@/lib/competencia"

// De qual mês é cada real.
//
// O defeito de origem: o DRE somava tudo por data de PAGAMENTO. Um serviço
// executado e recebido em janeiro, com comissão vencendo dia 5 de fevereiro,
// punha a receita em janeiro e o custo dela em fevereiro — janeiro com lucro
// inflado, fevereiro com prejuízo artificial, todo mês, sem ninguém perceber
// porque os dois números são plausíveis.

const jan = new Date("2026-01-20T12:00:00Z")
const fev = new Date("2026-02-05T12:00:00Z")

const pago = {
  paidAt: fev,
  dueDate: fev,
  accrualDate: jan,
  status: "PAID",
}

describe("o mesmo lançamento cai em meses diferentes, e é de propósito", () => {
  it("em CAIXA, conta no mês em que o dinheiro se moveu", () => {
    expect(dataDoResultado(pago, "caixa")).toBe(fev)
  })

  it("em COMPETÊNCIA, conta no mês em que o fato aconteceu", () => {
    // É a comissão de janeiro voltando para janeiro, ao lado da receita que a
    // gerou.
    expect(dataDoResultado(pago, "competencia")).toBe(jan)
  })
})

describe("o que ainda não foi pago", () => {
  const pendente = { paidAt: null, dueDate: fev, accrualDate: jan, status: "PENDING" }

  it("em CAIXA, não conta — não é dívida esquecida, é dinheiro que não se moveu", () => {
    expect(dataDoResultado(pendente, "caixa")).toBeNull()
  })

  it("em COMPETÊNCIA, conta — o serviço foi entregue", () => {
    // É o caso do cliente que pediu prazo: o trabalho foi feito em janeiro e o
    // resultado é de janeiro, ainda que o boleto só caia depois.
    expect(dataDoResultado(pendente, "competencia")).toBe(jan)
  })

  it("marcado PAGO mas sem data de pagamento não entra no caixa", () => {
    // Estado que não deveria existir, mas existe em base velha. Contar sem
    // data significaria escolher um mês no chute.
    const torto = { ...pago, paidAt: null }
    expect(dataDoResultado(torto, "caixa")).toBeNull()
  })
})

describe("os lançamentos ANTIGOS, sem data de competência", () => {
  it("caem no VENCIMENTO, e não no pagamento", () => {
    // `dueDate` é o que a pessoa digitou pensando no mês do lançamento.
    // `paidAt` é exatamente o que a competência existe para NÃO usar — cair
    // nele faria o regime novo devolver os mesmos números do antigo para todo
    // lançamento antigo, e daria a impressão de que nada mudou.
    const antigo = { paidAt: fev, dueDate: jan, accrualDate: null, status: "PAID" }
    expect(dataDoResultado(antigo, "competencia")).toBe(jan)
    expect(dataDeCompetencia(antigo)).toBe(jan)
  })

  it("a data própria vence o vencimento quando existe", () => {
    expect(dataDeCompetencia({ dueDate: fev, accrualDate: jan })).toBe(jan)
  })
})

describe("o recorte do período", () => {
  const inicio = new Date("2026-01-01T03:00:00Z")
  const fim = new Date("2026-02-01T03:00:00Z")

  it("inclui o começo e EXCLUI o fim", () => {
    // Fim exclusivo, como o resto dos relatórios: o limite é a meia-noite do
    // dia seguinte, e não 23:59:59, para não perder o último segundo do dia.
    expect(dentroDoPeriodo(inicio, inicio, fim)).toBe(true)
    expect(dentroDoPeriodo(fim, inicio, fim)).toBe(false)
    expect(dentroDoPeriodo(new Date(fim.getTime() - 1), inicio, fim)).toBe(true)
  })

  it("data nula fica fora", () => {
    expect(dentroDoPeriodo(null, inicio, fim)).toBe(false)
  })
})

describe("o padrão não muda sozinho", () => {
  it("continua sendo CAIXA", () => {
    // Trocar o padrão faria todos os meses que o dono já conferiu mudarem de
    // valor de um dia para o outro, sem ele ter pedido — e o relatório é o
    // número em que ele mais confia.
    expect(REGIME_PADRAO).toBe("caixa")
  })

  it("regime inventado não passa", () => {
    // O parâmetro vem da URL, que qualquer um digita.
    expect(regimeValido("caixa")).toBe(true)
    expect(regimeValido("competencia")).toBe(true)
    expect(regimeValido("competência")).toBe(false)
    expect(regimeValido("")).toBe(false)
  })
})
