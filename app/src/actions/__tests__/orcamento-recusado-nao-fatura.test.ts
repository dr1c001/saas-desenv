import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Orçamento recusado não vira receita do serviço.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `valorDeFechamento`, em lib/os-orcamento.ts, decide que uma OS cujo orçamento
// foi RECUSADO fecha pela taxa de visita da empresa — e não pelos itens, que são
// justamente o serviço que o cliente disse que não queria. A função tem teste
// próprio desde que foi escrita. NENHUMA linha de produção a chamava.
//
// A tela já prometia o comportamento ao dono: "Cliente recusou. Esta OS fecha
// com a taxa de visita de R$ X, e não com o valor dos itens." A ajuda do campo
// em Configurações também: "Deixe em zero para não cobrar — a OS fecha sem
// valor." O fechamento somava os itens e pronto.
//
// Empresa com taxa de R$ 120, orçamento de R$ 1.800 recusado: o sistema faturava
// os R$ 1.800 que o cliente acabou de recusar, e lançava comissão por cima.
//
// (Achado na auditoria de 13/09/2026 — oitava aparição de código construído,
// testado e sem nenhum caminho até ele.)

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

async function cenario(opts: { taxa?: number; statusDoOrcamento?: string | null } = {}) {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", visitFee: opts.taxa ?? 120 },
  })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: tecnico.id, role: "OWNER" })

  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      technicianId: tecnico.id,
      number: 1,
      title: "Troca de compressor",
      status: "OPEN",
    },
  })
  if (opts.statusDoOrcamento) {
    await testDb.db.quote.create({
      data: {
        tenantId: tenant.id,
        clientId: cliente.id,
        clientName: cliente.name,
        description: "Troca de compressor",
        orderId: os.id,
        number: 1,
        amount: 1800,
        status: opts.statusDoOrcamento as never,
      },
    })
  }
  return { tenant, os, cliente }
}

const ITENS = [{ description: "Compressor + mão de obra", quantity: 1, unitPrice: 1800 }]

describe("concluir uma OS com orçamento recusado", () => {
  it("fecha pela TAXA DE VISITA, não pelos itens recusados", async () => {
    // O caso central. R$ 1.800 recusados, taxa de R$ 120.
    const { os } = await cenario({ taxa: 120, statusDoOrcamento: "REJECTED" })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Cliente recusou", ITENS, false)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(120)
  })

  it("com taxa ZERO, fecha sem valor — e faturar não gera receita", async () => {
    // "Deixe em zero para não cobrar — a OS fecha sem valor", diz a ajuda do
    // campo. `INVOICED` só cria Revenue com total > 0.
    const { tenant, os } = await cenario({ taxa: 0, statusDoOrcamento: "REJECTED" })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Cliente recusou", ITENS, true)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(0)
    expect(await testDb.db.revenue.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it("a comissão incide sobre a taxa, não sobre o serviço recusado", async () => {
    // O prejuízo dobrado: além de cobrar o que o cliente recusou, pagava-se
    // comissão sobre isso.
    const { os } = await cenario({ taxa: 120, statusDoOrcamento: "REJECTED" })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Cliente recusou", ITENS, false, 10)

    const comissao = await testDb.db.expense.findFirst({ where: { orderId: os.id } })
    expect(Number(comissao?.amount)).toBe(12)
  })
})

describe("os outros casos não mudam", () => {
  it("orçamento APROVADO fecha pelo valor dos itens", async () => {
    const { os } = await cenario({ taxa: 120, statusDoOrcamento: "APPROVED" })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(1800)
  })

  it("orçamento ainda AGUARDANDO fecha pelos itens", async () => {
    // Faturar com o orçamento em aberto é decisão da empresa — a tela avisa,
    // mas não impede. O valor continua sendo o do serviço.
    const { os } = await cenario({ taxa: 120, statusDoOrcamento: "SENT" })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Combinado por telefone", ITENS, false)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(1800)
  })

  it("OS SEM orçamento nenhum fecha pelos itens — o caminho mais comum", async () => {
    // A maioria das OS não tem orçamento. Nada aqui pode mudar para elas.
    const { os } = await cenario({ taxa: 120, statusDoOrcamento: null })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(Number(depois?.totalAmount)).toBe(1800)
  })
})
