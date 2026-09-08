import { describe, expect, it } from "vitest"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { AdminReportPDF, type DadosRelatorio } from "@/components/pdf/admin-report-pdf"

// PDF quebra de um jeito chato: erro só na hora de gerar, com o dono já
// clicando no botão. Estes testes exercitam a geração de verdade.

function dados(over: Partial<DadosRelatorio> = {}): DadosRelatorio {
  return {
    geradoEm: new Date("2026-08-10T15:00:00Z"),
    geradoPor: "dono@servicoos.com.br",
    resumo: {
      companies: 4, activeCompanies: 1, pendingCompanies: 0, pastDueCompanies: 0,
      cancelledCompanies: 1, trialCompanies: 2, users: 6, payingUsers: 2, mrr: 97,
    },
    evolucao: [{ mes: "ago. de 2026", empresas: 4, pagantes: 1, mrr: 97 }],
    empresas: [
      {
        nome: "Livela store", documento: "12345678000199", status: "ACTIVE",
        plano: "Starter", valorMensal: 97, usuarios: 2, ordens: 5, clientes: 3,
        cadastroEm: new Date("2026-07-01T12:00:00Z"),
        renovaEm: new Date("2026-09-01T12:00:00Z"),
      },
    ],
    acoes: [
      { quando: new Date("2026-08-10T14:00:00Z"), quem: "dono@servicoos.com.br", acao: "Liberou acesso", detalhe: "Livela store: PENDING → ACTIVE" },
    ],
    ...over,
  }
}

async function gerar(d: DadosRelatorio) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(AdminReportPDF, { dados: d }) as any)
}

describe("relatório administrativo em PDF", () => {
  it("gera um PDF válido", async () => {
    const buf = await gerar(dados())
    expect(buf.length).toBeGreaterThan(1000)
    // Todo PDF começa com a assinatura "%PDF".
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera mesmo sem nenhuma empresa, retrato ou ação", async () => {
    // O dia 1 do sistema, e também o resultado de uma busca que não achou
    // nada: nenhum dos blocos pode explodir por lista vazia.
    const buf = await gerar(dados({ empresas: [], evolucao: [], acoes: [] }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera com empresa sem plano, sem CNPJ e sem data de renovação", async () => {
    const buf = await gerar(
      dados({
        empresas: [
          {
            nome: "Empresa em teste", documento: null, status: "TRIAL",
            plano: null, valorMensal: 0, usuarios: 1, ordens: 0, clientes: 0,
            cadastroEm: new Date("2026-08-01T12:00:00Z"), renovaEm: null,
          },
        ],
      })
    )
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera com muitas empresas (quebra de página)", async () => {
    const uma = dados().empresas[0]
    const buf = await gerar(dados({ empresas: Array.from({ length: 120 }, () => ({ ...uma })) }))
    expect(buf.length).toBeGreaterThan(5000)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera com o aviso de empresas aguardando pagamento", async () => {
    const d = dados()
    const buf = await gerar({ ...d, resumo: { ...d.resumo, pendingCompanies: 3 } })
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })
})
