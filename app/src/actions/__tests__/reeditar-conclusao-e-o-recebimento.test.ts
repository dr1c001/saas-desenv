import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Reeditar a conclusão não pode deixar o contas a receber para trás.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `completeServiceOrder` gravava o `totalAmount` novo e, logo abaixo, só criava
// receita quando NÃO havia nenhuma. Nada em lugar nenhum sincronizava as
// receitas já existentes com o total.
//
// OS de R$ 2.000 parcelada em 3× (700/700/600). O dono percebe um item lançado
// errado, abre "Editar conclusão" e tira R$ 500 em peças. O `totalAmount` vira
// R$ 1.500 — e as três parcelas continuam somando R$ 2.000. O cliente é cobrado
// R$ 500 a mais, a fatura em PDF soma R$ 2.000, e a tela da OS mostra R$ 1.500.
//
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
    checarAcao: vi.fn().mockResolvedValue(null),
    getAcoesPermitidas: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(false),
    requireCotaDeOs: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/service-orders")

async function osConcluida(total: number) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "tec", role: "OWNER" })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      technicianId: tecnico.id,
      number: 1,
      title: "Reforma",
      status: "DONE",
      concludedAt: new Date(),
      totalAmount: total,
    },
  })
  return { tenant, os }
}

const receita = (tenantId: string, orderId: string, valor: number, status = "PENDING") =>
  testDb.db.revenue.create({
    data: {
      tenantId,
      orderId,
      description: "Reforma",
      amount: valor,
      dueDate: new Date(),
      status: status as never,
    },
  })

const ITENS_1500 = [{ description: "Serviço", quantity: 1, unitPrice: 1500 }]

describe("mudar o valor de uma OS concluída", () => {
  it("com UMA receita pendente, o valor dela acompanha", async () => {
    // O caso simples: faturou, viu que estava errado, corrigiu. Nada foi
    // combinado em parcelas, então não há acordo a preservar.
    const { tenant, os } = await osConcluida(2000)
    await receita(tenant.id, os.id, 2000)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Corrigido", ITENS_1500, false)

    const r = await testDb.db.revenue.findFirst({ where: { orderId: os.id } })
    expect(Number(r?.amount)).toBe(1500)
  })

  it("com PLANO DE PARCELAS, recusa e explica", async () => {
    // As datas foram combinadas com o cliente. Redistribuir por conta própria
    // seria inventar um acordo que ninguém fez — e deixar como estava cobraria
    // o valor antigo.
    const { tenant, os } = await osConcluida(2000)
    await receita(tenant.id, os.id, 700)
    await receita(tenant.id, os.id, 700)
    await receita(tenant.id, os.id, 600)
    const { completeServiceOrder } = await acoes()

    await expect(
      completeServiceOrder(os.id, "Corrigido", ITENS_1500, false)
    ).rejects.toThrow("parceladaNaoRecalcula")

    const soma = (await testDb.db.revenue.findMany({ where: { orderId: os.id } })).reduce(
      (s, r) => s + Number(r.amount),
      0
    )
    expect(soma).toBe(2000)
    // E a OS não mudou: ou tudo, ou nada.
    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(2000)
  })

  it("com receita já PAGA, recusa também", async () => {
    // Dinheiro que entrou já está no extrato e no resultado do mês.
    const { tenant, os } = await osConcluida(2000)
    await receita(tenant.id, os.id, 2000, "PAID")
    const { completeServiceOrder } = await acoes()

    await expect(
      completeServiceOrder(os.id, "Corrigido", ITENS_1500, false)
    ).rejects.toThrow("parceladaNaoRecalcula")
  })

  it("reeditar SEM mudar o valor continua livre, mesmo parcelada", async () => {
    // Corrigir o texto da conclusão não mexe em dinheiro nenhum, e não pode
    // ser barrado pela trava acima.
    const { tenant, os } = await osConcluida(2000)
    await receita(tenant.id, os.id, 1000)
    await receita(tenant.id, os.id, 1000)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(
      os.id,
      "Texto corrigido",
      [{ description: "Serviço", quantity: 1, unitPrice: 2000 }],
      false
    )

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.conclusionNote).toBe("Texto corrigido")
  })

  it("sem receita nenhuma, faturar cria — como sempre fez", async () => {
    const { tenant, os } = await osConcluida(1500)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS_1500, true)

    const rs = await testDb.db.revenue.findMany({ where: { tenantId: tenant.id } })
    expect(rs).toHaveLength(1)
    expect(Number(rs[0].amount)).toBe(1500)
  })
})
