import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A fronteira entre "relatórios básicos" (Starter) e "avançados" (Pro+).
//
// É uma regra que vale dinheiro — a diferença entre R$ 97 e R$ 197 — e até
// aqui não tinha teste nenhum. Frágil de um jeito específico: o recurso entra
// no Pro por SEM_EXCLUSIVOS, que é DERIVADO de TODOS menos os exclusivos.
// Qualquer mexida nessa derivação move o recurso de plano sem ninguém ver.
//
// A linha: o básico dá QUANTO (totais, contagens, OS por status, sempre do mês
// corrente). O avançado dá QUEM e QUANDO (ranking, desempenho, detalhamento
// linha a linha, período à escolha).

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

/** Recursos por plano espelhando lib/plan.ts: o Starter não tem nenhum. */
const RECURSOS_PRO = [
  "gpsMap",
  "nfse",
  "signature",
  "checklist",
  "advancedReports",
  "stock",
]

async function empresa(slug: "starter" | "pro") {
  const plano = await testDb.db.plan.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: slug,
      priceMonthly: 100,
      priceYearly: 1000,
      features: slug === "pro" ? RECURSOS_PRO : [],
    },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: `Empresa ${slug}`, planId: plano.id, subscriptionStatus: "ACTIVE" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
  return tenant
}

/** Uma OS faturada, paga NESTE mês — é o que alimenta ranking e detalhamento. */
async function osFaturadaEPaga(tenantId: string, valor: number, cliente: string) {
  const c = await testDb.db.client.create({ data: { name: cliente, tenantId } })
  const os = await testDb.db.serviceOrder.create({
    data: {
      number: Math.floor(Math.random() * 100000),
      title: "Serviço",
      clientId: c.id,
      tenantId,
      status: "INVOICED",
      totalAmount: valor,
      concludedAt: new Date(),
    },
  })
  await testDb.db.revenue.create({
    data: {
      description: "Serviço",
      amount: valor,
      dueDate: new Date(),
      paidAt: new Date(),
      status: "PAID",
      tenantId,
      orderId: os.id,
    },
  })
  return os
}

/** Um período largo, que o Starter NÃO deve conseguir usar. */
const ANO_INTEIRO = ["2026-01-01", "2026-12-31"] as const

describe("o que o Starter recebe", () => {
  it("recebe os totais e as contagens — o 'como foi meu mês'", async () => {
    const t = await empresa("starter")
    await osFaturadaEPaga(t.id, 1000, "Cliente A")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)

    expect(d.avancado).toBe(false)
    expect(Number(d.totalRevenue)).toBe(1000)
    expect(d.revenueCount).toBe(1)
    // osByStatus e um mapa status -> contagem, e nao lista.
    expect(Object.keys(d.osByStatus).length).toBeGreaterThan(0)
    expect(d.osByStatus.INVOICED).toBe(1)
  })

  it("NÃO recebe o ranking de clientes", async () => {
    // Vazio de verdade, e não escondido no HTML: a Action tem endereço próprio
    // e é chamável direto. Esconder na tela não esconderia o dado.
    const t = await empresa("starter")
    await osFaturadaEPaga(t.id, 1000, "Cliente A")
    const { getReportData } = await import("@/actions/reports")

    expect((await getReportData(...ANO_INTEIRO)).topClients).toEqual([])
  })

  it("NÃO recebe o detalhamento linha a linha", async () => {
    const t = await empresa("starter")
    await osFaturadaEPaga(t.id, 1000, "Cliente A")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)
    expect(d.revenues).toEqual([])
    expect(d.expenses).toEqual([])
  })

  it("NÃO recebe o desempenho por profissional", async () => {
    const t = await empresa("starter")
    await osFaturadaEPaga(t.id, 1000, "Cliente A")
    const { getReportData } = await import("@/actions/reports")

    expect((await getReportData(...ANO_INTEIRO)).porProfissional).toEqual([])
  })

  it("tem o período FORÇADO ao mês corrente, mesmo pedindo o ano inteiro", async () => {
    // O teste central. O período é forçado no SERVIDOR, e não escondido na
    // tela: quem chamar a Action direto com qualquer from/to recebe o mês.
    await empresa("starter")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)

    const hoje = new Date()
    const mesAtual = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`
    expect(d.periodo.from.startsWith(mesAtual)).toBe(true)
    expect(d.periodo.from.endsWith("-01")).toBe(true)
  })

  it("devolve o período QUE VALEU, e não o que foi pedido", async () => {
    // Se devolvesse o pedido, a tela mostraria "01/01 a 31/12" sobre números
    // de um mês só — e quem lê concluiria que a empresa faturou quase nada no
    // ano.
    await empresa("starter")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)
    expect(d.periodo.from).not.toBe("2026-01-01")
  })
})

describe("o que o Pro recebe a mais", () => {
  it("recebe o ranking de clientes", async () => {
    const t = await empresa("pro")
    await osFaturadaEPaga(t.id, 1500, "Cliente Grande")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)

    expect(d.avancado).toBe(true)
    expect(d.topClients.length).toBe(1)
    expect(d.topClients[0].name).toBe("Cliente Grande")
  })

  it("recebe o detalhamento linha a linha", async () => {
    const t = await empresa("pro")
    await osFaturadaEPaga(t.id, 1500, "Cliente Grande")
    const { getReportData } = await import("@/actions/reports")

    expect((await getReportData(...ANO_INTEIRO)).revenues.length).toBe(1)
  })

  it("escolhe o próprio período", async () => {
    await empresa("pro")
    const { getReportData } = await import("@/actions/reports")

    const d = await getReportData(...ANO_INTEIRO)
    expect(d.periodo.from).toBe("2026-01-01")
  })
})

describe("os dois planos veem os mesmos totais do mesmo período", () => {
  it("o básico não é um relatório ERRADO, é um relatório menor", async () => {
    // Uma diferença de VALORES entre os planos seria defeito, e não produto:
    // o Starter tem menos análise, não números diferentes.
    const s = await empresa("starter")
    await osFaturadaEPaga(s.id, 700, "Cliente X")
    const { getReportData } = await import("@/actions/reports")
    const doStarter = await getReportData(...ANO_INTEIRO)

    const p = await empresa("pro")
    await osFaturadaEPaga(p.id, 700, "Cliente X")
    const doPro = await getReportData(doStarter.periodo.from, doStarter.periodo.to)

    expect(Number(doPro.totalRevenue)).toBe(Number(doStarter.totalRevenue))
    expect(doPro.revenueCount).toBe(doStarter.revenueCount)
  })
})
