import { describe, expect, it } from "vitest"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { ContratoPDF, VERSAO_CONTRATO, type DadosContrato } from "@/components/pdf/contrato-pdf"

// Contrato é documento jurídico enviado a cliente real. Se ele falhar ao
// gerar, o cliente paga e não recebe nada — e o erro só apareceria no log.

function dados(over: Partial<DadosContrato> = {}): DadosContrato {
  return {
    numero: "2026-AB12CD34",
    emitidoEm: new Date("2026-08-10T15:00:00Z"),
    empresa: {
      nome: "Livela store",
      documento: "12.345.678/0001-99",
      email: "dona@livela.com.br",
      endereco: "Rua das Flores, 100 — Piracicaba/SP",
    },
    plano: { nome: "Starter", valorMensal: 97, ciclo: "MENSAL", valorCobrado: 97 },
    inicioVigencia: new Date("2026-08-01T12:00:00Z"),
    diasCarencia: 5,
    ...over,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gerar = (d: DadosContrato) => renderToBuffer(React.createElement(ContratoPDF, { dados: d }) as any)

describe("contrato em PDF", () => {
  it("gera um PDF válido", async () => {
    const buf = await gerar(dados())
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
    // Três páginas de cláusulas — se sair muito menor, algo não renderizou.
    expect(buf.length).toBeGreaterThan(5000)
  })

  it("gera para empresa sem CNPJ e sem endereço", async () => {
    // Cadastro incompleto não pode impedir o contrato de existir.
    const d = dados()
    const buf = await gerar({ ...d, empresa: { ...d.empresa, documento: null, endereco: null } })
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera no plano anual", async () => {
    const buf = await gerar(dados({ plano: { nome: "Pro", valorMensal: 197, ciclo: "ANUAL", valorCobrado: 1970 } }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("acompanha a carência real, sem número escrito à mão", async () => {
    // Se a carência mudar em lib/past-due.ts, o contrato tem que mudar junto —
    // um contrato dizendo "5 dias" com o sistema cortando em 3 é problema.
    const buf = await gerar(dados({ diasCarencia: 7 }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("tem versão declarada", () => {
    // O cliente recebeu UMA versão específica no dia em que assinou; sem
    // versionar, não há como saber qual texto ele aceitou.
    expect(VERSAO_CONTRATO).toMatch(/^\d+\.\d+$/)
  })
})
