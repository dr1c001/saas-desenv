import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { dataDoResultado, dentroDoPeriodo } from "@/lib/competencia"

// O DRE nos dois regimes.
//
// ─── O que este arquivo guarda ───────────────────────────────────────────────
//
// A regra ("de qual mês é este lançamento") vive em lib/competencia.ts e é
// testada lá. Mas o relatório NÃO chama essa função: por desempenho, ele
// recorta o período no PRÓPRIO BANCO, com um `where` que espelha a regra.
//
// Duas cópias da mesma regra, uma em JavaScript e outra em Prisma. É o desenho
// certo — carregar a tabela inteira para filtrar em memória não escala — e é
// exatamente o desenho que convida as duas a divergirem em silêncio.
//
// Por isso o teste central daqui compara as DUAS: monta linhas de todos os
// formatos, roda a consulta de verdade, roda o predicado puro sobre as mesmas
// linhas, e exige o mesmo conjunto. Se alguém mexer num lado só, quebra.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(true),
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (c: string) => c,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

// Janeiro de 2026 em horário de Brasília.
const DE = "2026-01-01"
const ATE = "2026-01-31"
const inicio = new Date("2026-01-01T03:00:00Z")
const fim = new Date("2026-02-01T03:00:00Z")

const jan = new Date("2026-01-20T15:00:00Z")
const fev = new Date("2026-02-05T15:00:00Z")

async function empresa() {
  const t = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: "u1", role: "OWNER", branchId: null })
  return t
}

/** Todos os formatos de lançamento que existem na base real. */
function amostra(tenantId: string) {
  return [
    // O caso do defeito: fato em janeiro, dinheiro em fevereiro.
    { nome: "fato-jan-pago-fev", dueDate: fev, accrualDate: jan, paidAt: fev, status: "PAID" as const },
    // Tudo em janeiro.
    { nome: "tudo-jan", dueDate: jan, accrualDate: jan, paidAt: jan, status: "PAID" as const },
    // Serviço de janeiro que o cliente ainda não pagou.
    { nome: "jan-nao-pago", dueDate: fev, accrualDate: jan, paidAt: null, status: "PENDING" as const },
    // Lançamento ANTIGO, sem competência: vale o vencimento.
    { nome: "antigo-venc-jan", dueDate: jan, accrualDate: null, paidAt: fev, status: "PAID" as const },
    { nome: "antigo-venc-fev", dueDate: fev, accrualDate: null, paidAt: jan, status: "PAID" as const },
    // Fora dos dois lados.
    { nome: "tudo-fev", dueDate: fev, accrualDate: fev, paidAt: fev, status: "PAID" as const },
    // Estado torto que existe em base velha: pago sem data de pagamento.
    { nome: "pago-sem-data", dueDate: jan, accrualDate: jan, paidAt: null, status: "PAID" as const },
  ].map((l) => ({ ...l, tenantId, description: l.nome, amount: 100 }))
}

async function semear(tenantId: string) {
  const linhas = amostra(tenantId)
  for (const l of linhas) {
    const { nome, ...dados } = l
    expect(nome).toBeTruthy()
    await testDb.db.revenue.create({ data: dados })
    await testDb.db.expense.create({ data: { ...dados, category: "OTHER" } })
  }
  return linhas
}

const relatorio = () => import("@/actions/reports")

describe("a consulta do banco concorda com a regra pura", () => {
  for (const regime of ["caixa", "competencia"] as const) {
    it(`em ${regime}, o banco devolve exatamente o que a regra escolheria`, async () => {
      const t = await empresa()
      const linhas = await semear(t.id)
      const { getReportData } = await relatorio()

      const d = await getReportData(DE, ATE, regime)

      const esperado = linhas
        .filter((l) => dentroDoPeriodo(dataDoResultado(l, regime), inicio, fim))
        .map((l) => l.nome)
        .sort()

      expect(d.revenues.map((r) => r.description).sort()).toEqual(esperado)
      expect(d.expenses.map((e) => e.description).sort()).toEqual(esperado)
    })
  }
})

describe("o defeito que motivou tudo isto", () => {
  it("em CAIXA, a comissão de janeiro cai em fevereiro e janeiro fica inflado", async () => {
    const t = await empresa()
    // Receita do serviço: recebida em janeiro.
    await testDb.db.revenue.create({
      data: { tenantId: t.id, description: "OS de janeiro", amount: 1200, dueDate: jan, accrualDate: jan, paidAt: jan, status: "PAID" },
    })
    // Comissão do mesmo serviço: vence e é paga dia 5 de fevereiro.
    await testDb.db.expense.create({
      data: { tenantId: t.id, description: "Comissão", amount: 120, dueDate: fev, accrualDate: jan, paidAt: fev, status: "PAID", category: "VARIABLE" },
    })
    const { getReportData } = await relatorio()

    const caixa = await getReportData(DE, ATE, "caixa")

    // Janeiro parece um mês melhor do que foi: a receita inteira, custo nenhum.
    expect(caixa.totalRevenue).toBe(1200)
    expect(caixa.totalExpense).toBe(0)
    expect(caixa.result).toBe(1200)
  })

  it("em COMPETÊNCIA, os dois caem juntos em janeiro", async () => {
    const t = await empresa()
    await testDb.db.revenue.create({
      data: { tenantId: t.id, description: "OS de janeiro", amount: 1200, dueDate: jan, accrualDate: jan, paidAt: jan, status: "PAID" },
    })
    await testDb.db.expense.create({
      data: { tenantId: t.id, description: "Comissão", amount: 120, dueDate: fev, accrualDate: jan, paidAt: fev, status: "PAID", category: "VARIABLE" },
    })
    const { getReportData } = await relatorio()

    const comp = await getReportData(DE, ATE, "competencia")

    expect(comp.totalRevenue).toBe(1200)
    expect(comp.totalExpense).toBe(120)
    // O lucro de verdade do mês.
    expect(comp.result).toBe(1080)
  })

  it("e fevereiro deixa de nascer com prejuízo artificial", async () => {
    const t = await empresa()
    await testDb.db.expense.create({
      data: { tenantId: t.id, description: "Comissão", amount: 120, dueDate: fev, accrualDate: jan, paidAt: fev, status: "PAID", category: "VARIABLE" },
    })
    const { getReportData } = await relatorio()

    const fevCaixa = await getReportData("2026-02-01", "2026-02-28", "caixa")
    const fevComp = await getReportData("2026-02-01", "2026-02-28", "competencia")

    expect(fevCaixa.totalExpense).toBe(120)
    expect(fevComp.totalExpense).toBe(0)
  })
})

describe("o padrão e o que a tela mostra", () => {
  it("sem pedir regime, responde em CAIXA — como sempre foi", async () => {
    const t = await empresa()
    await semear(t.id)
    const { getReportData } = await relatorio()

    const semPedir = await getReportData(DE, ATE)
    const pedindoCaixa = await getReportData(DE, ATE, "caixa")

    expect(semPedir.regime).toBe("caixa")
    expect(semPedir.totalRevenue).toBe(pedindoCaixa.totalRevenue)
  })

  it("regime inventado na URL cai no padrão, em vez de quebrar", async () => {
    const t = await empresa()
    await semear(t.id)
    const { getReportData } = await relatorio()

    const d = await getReportData(DE, ATE, "competencia-maluca")

    expect(d.regime).toBe("caixa")
  })

  it("o relatório DIZ qual regime respondeu", async () => {
    // Os dois números são plausíveis. Um relatório que não diz qual pergunta
    // respondeu é o defeito de origem outra vez, agora com duas respostas.
    const t = await empresa()
    await semear(t.id)
    const { getReportData } = await relatorio()

    expect((await getReportData(DE, ATE, "competencia")).regime).toBe("competencia")
  })

  it("não mistura empresas", async () => {
    const t = await empresa()
    await semear(t.id)
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await semear(outra.id)
    const { getReportData } = await relatorio()

    const d = await getReportData(DE, ATE, "competencia")

    // A amostra tem 5 linhas dentro da janela de competência; duas empresas
    // dobrariam para 10 se o filtro vazasse.
    expect(d.revenues.length).toBe(
      amostra(t.id).filter((l) => dentroDoPeriodo(dataDoResultado(l, "competencia"), inicio, fim)).length
    )
  })
})
