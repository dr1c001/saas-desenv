import { describe, expect, it } from "vitest"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { RelatorioPDF, type DadosDoRelatorio } from "@/components/pdf/relatorio-pdf"

// PDF quebra de um jeito chato: erro só na hora de gerar, com a pessoa já
// clicando no botão. Estes testes exercitam a geração de verdade.
//
// O que mais importa aqui: o relatório BÁSICO não pode virar uma porta lateral
// para o ranking e o detalhamento que o plano não inclui. Como o componente
// recebe os dados prontos de `getReportData`, as listas chegam vazias — e o
// que se confere é que ele DESENHA isso sem quebrar, e sem inventar seção.

function dados(over: Partial<DadosDoRelatorio> = {}): DadosDoRelatorio {
  return {
    empresa: {
      nome: "Livela store",
      documento: "12.345.678/0001-99",
      logoUrl: null,
      telefone: "(19) 3333-4444",
      endereco: "Rua das Flores, 100 — Piracicaba/SP",
      site: "https://livela.com.br",
    },
    periodo: { from: "2026-08-01", to: "2026-08-31" },
    geradoEm: new Date("2026-08-24T15:00:00Z"),
    avancado: true,
    totalRevenue: 24900,
    totalExpense: 3180,
    result: 21720,
    revenueCount: 12,
    expenseCount: 4,
    osByStatus: { OPEN: 3, IN_PROGRESS: 1, INVOICED: 8 },
    topClients: [
      { name: "Padaria Estrela", total: 9800 },
      { name: "Mercado São Jorge", total: 7400 },
    ],
    porProfissional: [
      {
        nome: "Carlos Menezes",
        concluidas: 8,
        total: 15200,
        ticketMedio: 1900,
        diasMedios: 2.5,
        nota: 9.2,
        respostas: 5,
      },
    ],
    revenues: [
      {
        description: "OS #0247 — Troca de compressor",
        amount: 1208,
        paidAt: new Date("2026-08-20T12:00:00Z"),
        order: { number: 247, title: "Troca de compressor" },
      },
    ],
    expenses: [
      {
        description: "Aluguel do galpão",
        amount: 2200,
        paidAt: new Date("2026-08-05T12:00:00Z"),
        category: "FIXED",
      },
    ],
    ...over,
  }
}

const gerar = (d: DadosDoRelatorio) => renderToBuffer(<RelatorioPDF d={d} />)

/** O básico é o que sai de getReportData com o plano Starter: totais cheios,
 *  listas avançadas vazias. */
const basico = () =>
  dados({ avancado: false, topClients: [], porProfissional: [], revenues: [], expenses: [] })

describe("o relatório completo gera", () => {
  it("produz um PDF de verdade", async () => {
    const buf = await gerar(dados())
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("o básico também gera, com as listas vazias", async () => {
    // O caso que quebraria em produção primeiro: a maioria das empresas está
    // no plano que não tem ranking nem detalhamento.
    const buf = await gerar(basico())
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("o básico é MENOR que o avançado", async () => {
    // Prova indireta, mas real: as seções avançadas de fato não entram no
    // arquivo, em vez de entrarem em branco ocupando espaço.
    const [av, bas] = await Promise.all([gerar(dados()), gerar(basico())])
    expect(bas.length).toBeLessThan(av.length)
  })
})

describe("os casos que quebram PDF na vida real", () => {
  it("empresa sem nada no período", async () => {
    const buf = await gerar(
      dados({
        totalRevenue: 0,
        totalExpense: 0,
        result: 0,
        revenueCount: 0,
        expenseCount: 0,
        osByStatus: {},
        topClients: [],
        porProfissional: [],
        revenues: [],
        expenses: [],
      })
    )
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("prejuízo no período", async () => {
    // O cartão troca de cor e de rótulo. Um `toFixed` num número negativo mal
    // tratado quebraria só aqui.
    const buf = await gerar(dados({ totalRevenue: 1000, totalExpense: 4000, result: -3000 }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("empresa sem logo e sem documento", async () => {
    const buf = await gerar(dados({
        empresa: {
          nome: "Sem Nada",
          documento: null,
          logoUrl: null,
          telefone: null,
          endereco: null,
          site: null,
        },
      }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("profissional sem nota e sem dias médios", async () => {
    // `null` nos dois campos é o caso de quem não concluiu nada ou não foi
    // avaliado — e é o que um `.toFixed()` direto quebraria.
    const buf = await gerar(
      dados({
        porProfissional: [
          {
            nome: "Sem responsável",
            concluidas: 0,
            total: 0,
            ticketMedio: 0,
            diasMedios: null,
            nota: null,
            respostas: 0,
          },
        ],
      })
    )
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("receita sem ordem vinculada", async () => {
    // Despesa lançada à mão não tem OS. `order` ausente não pode virar
    // "#undefined" nem estourar.
    const buf = await gerar(
      dados({
        revenues: [
          { description: "Serviço avulso", amount: 500, paidAt: new Date(), order: null },
        ],
      })
    )
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("muitos lançamentos, forçando várias páginas", async () => {
    // Uma empresa com movimento real. Se a paginação estiver errada, quebra
    // aqui e não no teste de um lançamento só.
    const muitos = Array.from({ length: 120 }, (_, i) => ({
      description: `Lançamento número ${i} com uma descrição comprida o suficiente`,
      amount: 100 + i,
      paidAt: new Date("2026-08-10T12:00:00Z"),
      order: { number: i, title: "Serviço" },
    }))
    const buf = await gerar(dados({ revenues: muitos }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
    expect(buf.length).toBeGreaterThan(10_000)
  })

  it("nome de empresa longo não estoura o cabeçalho", async () => {
    const buf = await gerar(
      dados({
        empresa: {
          nome: "Desentupidora e Serviços Hidráulicos Integrados do Litoral Norte Ltda ME",
          documento: "12.345.678/0001-99",
          logoUrl: null,
          telefone: "(19) 99999-8888",
          endereco: "Avenida Comprida Sem Fim, 4321, Sala 12 — Bairro Distante, Piracicaba/SP",
          site: "https://desentupidoraintegradadolitoralnorte.com.br",
        },
      })
    )
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })
})
