import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O gráfico de 6 meses passou de 12 consultas (2 por mês, em laço) para 2
// agrupadas no banco. O risco dessa troca é sutil: `paidAt` é
// `timestamp without time zone` guardando UTC, então agrupar sem converter o
// fuso joga pagamentos da noite (BRT) para o mês seguinte. O erro não dá
// exceção — só mostra o dinheiro no mês errado.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

async function seed() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Empresa" } })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, role: "OWNER", userId: "u1" })
  return tenant
}

/** Primeiro instante (em UTC) do mês corrente no horário de Brasília. */
function inicioDoMesBRT() {
  const agora = new Date()
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 3, 0, 0))
}

describe("getMonthlyRevenueChart", () => {
  it("devolve exatamente 6 meses, do mais antigo ao mais recente", async () => {
    const { getMonthlyRevenueChart } = await import("@/actions/dashboard")
    await seed()

    const dados = await getMonthlyRevenueChart()
    expect(dados).toHaveLength(6)
    expect(dados.every((d) => typeof d.month === "string")).toBe(true)
  })

  it("soma receita e despesa do mês corrente", async () => {
    const { getMonthlyRevenueChart } = await import("@/actions/dashboard")
    const tenant = await seed()

    // Meio do mês corrente, longe de qualquer fronteira.
    const meio = new Date(inicioDoMesBRT().getTime() + 10 * 86400_000)
    await testDb.db.revenue.create({
      data: { description: "R1", amount: 1000, dueDate: meio, paidAt: meio, status: "PAID", tenantId: tenant.id },
    })
    await testDb.db.expense.create({
      data: { description: "D1", amount: 250, dueDate: meio, paidAt: meio, status: "PAID", tenantId: tenant.id },
    })

    const dados = await getMonthlyRevenueChart()
    expect(dados[5].receita).toBe(1000)
    expect(dados[5].despesa).toBe(250)
  })

  it("pagamento das 22h do último dia do mês conta no mês QUE ACABOU, não no seguinte", async () => {
    const { getMonthlyRevenueChart } = await import("@/actions/dashboard")
    const tenant = await seed()

    // 22h (BRT) do último dia do mês anterior = 01:00 UTC do dia 1 deste mês.
    // Agrupando em UTC, cairia no mês corrente — que é justamente o erro.
    const umaHoraUtcDoDia1 = new Date(inicioDoMesBRT().getTime() - 2 * 3600_000)
    await testDb.db.revenue.create({
      data: {
        description: "Pago às 22h da virada",
        amount: 777,
        dueDate: umaHoraUtcDoDia1,
        paidAt: umaHoraUtcDoDia1,
        status: "PAID",
        tenantId: tenant.id,
      },
    })

    const dados = await getMonthlyRevenueChart()
    expect(dados[4].receita).toBe(777) // mês anterior — o correto
    expect(dados[5].receita).toBe(0) // mês corrente — não pode ter vazado pra cá
  })

  it("ignora receita não paga e de outra empresa", async () => {
    const { getMonthlyRevenueChart } = await import("@/actions/dashboard")
    const tenant = await seed()
    const outra = await testDb.db.tenant.create({ data: { name: "Concorrente" } })
    const meio = new Date(inicioDoMesBRT().getTime() + 10 * 86400_000)

    await testDb.db.revenue.create({
      data: { description: "Pendente", amount: 500, dueDate: meio, paidAt: meio, status: "PENDING", tenantId: tenant.id },
    })
    await testDb.db.revenue.create({
      data: { description: "De outra empresa", amount: 900, dueDate: meio, paidAt: meio, status: "PAID", tenantId: outra.id },
    })

    const dados = await getMonthlyRevenueChart()
    expect(dados[5].receita).toBe(0)
  })

  it("mês sem movimento devolve zero, não some do gráfico", async () => {
    const { getMonthlyRevenueChart } = await import("@/actions/dashboard")
    await seed()

    const dados = await getMonthlyRevenueChart()
    expect(dados.every((d) => d.receita === 0 && d.despesa === 0)).toBe(true)
    expect(dados).toHaveLength(6)
  })
})
