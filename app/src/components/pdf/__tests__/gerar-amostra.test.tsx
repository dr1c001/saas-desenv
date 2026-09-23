import { describe, it } from "vitest"
import { writeFileSync } from "node:fs"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { RelatorioPDF, type DadosDoRelatorio } from "@/components/pdf/relatorio-pdf"

// Gera uma amostra em disco para OLHAR o resultado, e não só saber que não
// quebrou. Fica desligado por padrão: escrever arquivo a cada `npm test` seria
// lixo na pasta de quem só quer rodar a suíte.
//
//   AMOSTRA_PDF=1 npx vitest run src/components/pdf/__tests__/gerar-amostra
const ligado = process.env.AMOSTRA_PDF === "1"

/** PNG 1x1 verde, só para o cabeçalho ter uma logo de verdade para desenhar. */
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

const amostra: DadosDoRelatorio = {
  empresa: {
    nome: "Livela Store Serviços",
    documento: "12.345.678/0001-99",
    logoUrl: LOGO,
    telefone: "(19) 3333-4444",
    endereco: "Rua das Flores, 100 — Centro, Piracicaba/SP",
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
  osByStatus: { OPEN: 3, IN_PROGRESS: 1, DONE: 2, INVOICED: 8, CANCELLED: 1 },
  topClients: [
    { name: "Padaria Estrela", total: 9800 },
    { name: "Mercado São Jorge", total: 7400 },
    { name: "Condomínio Vila Nova", total: 4300 },
    { name: "Restaurante Dona Nena", total: 2100 },
  ],
  porProfissional: [
    { nome: "Carlos Menezes", concluidas: 8, total: 15200, ticketMedio: 1900, diasMedios: 2.5, nota: 9.2, respostas: 5 },
    { nome: "Rafael Lima", concluidas: 4, total: 6800, ticketMedio: 1700, diasMedios: 3.1, nota: 8.5, respostas: 2 },
    { nome: "Sem responsável", concluidas: 0, total: 0, ticketMedio: 0, diasMedios: null, nota: null, respostas: 0 },
  ],
  revenues: Array.from({ length: 12 }, (_, i) => ({
    description: `OS #02${40 + i} — Manutenção preventiva`,
    amount: 1200 + i * 130,
    paidAt: new Date(`2026-08-${String(3 + i).padStart(2, "0")}T12:00:00Z`),
    order: { number: 240 + i, title: "Manutenção" },
  })),
  expenses: [
    { description: "Aluguel do galpão", amount: 2200, paidAt: new Date("2026-08-05T12:00:00Z"), category: "FIXED" },
    { description: "Combustível da frota", amount: 640, paidAt: new Date("2026-08-12T12:00:00Z"), category: "VARIABLE" },
    { description: "Material de escritório", amount: 190, paidAt: new Date("2026-08-18T12:00:00Z"), category: "OTHER" },
    { description: "Manutenção da van", amount: 150, paidAt: new Date("2026-08-22T12:00:00Z"), category: "VARIABLE" },
  ],
}

describe.runIf(ligado)("amostra para conferir a olho", () => {
  it("grava o avançado e o básico", async () => {
    const dir = process.env.AMOSTRA_DIR ?? "."
    writeFileSync(`${dir}/amostra-avancado.pdf`, await renderToBuffer(<RelatorioPDF d={amostra} />))
    writeFileSync(
      `${dir}/amostra-basico.pdf`,
      await renderToBuffer(
        <RelatorioPDF
          d={{ ...amostra, avancado: false, topClients: [], porProfissional: [], revenues: [], expenses: [] }}
        />
      )
    )
  })
})
