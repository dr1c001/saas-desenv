import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Editar a OS não pode desligar o item da PEÇA do estoque.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `updateServiceOrder` reescreve os itens com `deleteMany` + `createMany`, e o
// `createMany` não mandava `partId`. O tipo declarado não tinha o campo e o
// formulário de edição nunca o enviava — ele remontava o estado a partir da OS
// descartando o vínculo.
//
// Para uma empresa com `commissionBase = "MAO_DE_OBRA"`, `partId` é o que
// separa peça de mão de obra: `baseParaComissao` desconta da base os itens que
// vieram do estoque. Apagando o vínculo, o compressor de R$ 1.000 vira mão de
// obra — e a comissão TRIPLICA na mesma gravação em que alguém só queria
// corrigir um erro de digitação no título.
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

async function cenario(base: "TOTAL" | "MAO_DE_OBRA") {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", commissionBase: base },
  })
  const tecnica = await testDb.db.user.create({
    data: { id: "ana", tenantId: tenant.id, name: "Ana", email: "a@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "ana", role: "OWNER" })

  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const peca = await testDb.db.part.create({
    data: { tenantId: tenant.id, name: "Compressor", unit: "un", stock: 5, salePrice: 1000 },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      technicianId: tecnica.id,
      number: 1,
      title: "Troca de compressor",
      status: "DONE",
      concludedAt: new Date(),
      totalAmount: 1200,
      commissionPct: 10,
      items: {
        create: [
          { description: "Compressor", quantity: 1, unitPrice: 1000, total: 1000, partId: peca.id },
          { description: "Mão de obra", quantity: 1, unitPrice: 200, total: 200 },
        ],
      },
    },
  })
  return { tenant, os, cliente, peca }
}

/** Como a tela de edição envia: os itens num JSON só, no campo `items`. */
function formulario(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function editar(id: string, campos: Record<string, string>) {
  const { updateServiceOrder } = await acoes()
  await expect(updateServiceOrder(id, {}, formulario(campos))).rejects.toThrow(
    `REDIRECT:/service-orders/${id}`
  )
}

describe("editar uma OS com peça do estoque", () => {
  it("o vínculo com a peça SOBREVIVE", async () => {
    const { os, cliente, peca } = await cenario("MAO_DE_OBRA")

    await editar(os.id, {
      title: "Troca do compressor",
      clientId: cliente.id,
      items: JSON.stringify([
        { description: "Compressor", quantity: 1, unitPrice: 1000, partId: peca.id },
        { description: "Mão de obra", quantity: 1, unitPrice: 200 },
      ]),
    })

    const itens = await testDb.db.serviceItem.findMany({ where: { orderId: os.id } })
    const compressor = itens.find((i) => i.description === "Compressor")
    expect(compressor?.partId).toBe(peca.id)
  })

  it("e a comissão sobre MÃO DE OBRA não triplica", async () => {
    // O prejuízo concreto. Base de R$ 200 (só a mão de obra) a 10% = R$ 20.
    // Com o vínculo apagado, a base virava R$ 1.200 e a comissão R$ 120.
    const { os, cliente, peca, tenant } = await cenario("MAO_DE_OBRA")
    const { reconciliarComissao } = await import("@/lib/comissao-db")
    await reconciliarComissao(testDb.db, tenant.id, os.id)
    expect(Number((await testDb.db.expense.findFirst({ where: { orderId: os.id } }))?.amount)).toBe(20)

    await editar(os.id, {
      title: "Troca do compressor",
      clientId: cliente.id,
      items: JSON.stringify([
        { description: "Compressor", quantity: 1, unitPrice: 1000, partId: peca.id },
        { description: "Mão de obra", quantity: 1, unitPrice: 200 },
      ]),
    })

    const comissao = await testDb.db.expense.findFirst({ where: { orderId: os.id } })
    expect(Number(comissao?.amount)).toBe(20)
  })

  it("item novo, digitado na edição, entra sem peça — e isso é certo", async () => {
    // Mão de obra, taxa e deslocamento não vêm do estoque. `partId` nulo é o
    // caminho normal, não uma falha.
    const { os, cliente, peca } = await cenario("MAO_DE_OBRA")

    await editar(os.id, {
      title: "Troca do compressor",
      clientId: cliente.id,
      items: JSON.stringify([
        { description: "Compressor", quantity: 1, unitPrice: 1000, partId: peca.id },
        { description: "Deslocamento", quantity: 1, unitPrice: 80 },
      ]),
    })

    const itens = await testDb.db.serviceItem.findMany({ where: { orderId: os.id } })
    expect(itens.find((i) => i.description === "Deslocamento")?.partId).toBeNull()
  })

  it("com a comissão sobre o TOTAL, o valor não muda de qualquer jeito", async () => {
    // Guarda contra a correção ter efeito onde não devia.
    const { os, cliente, peca, tenant } = await cenario("TOTAL")
    const { reconciliarComissao } = await import("@/lib/comissao-db")

    await editar(os.id, {
      title: "Troca do compressor",
      clientId: cliente.id,
      items: JSON.stringify([
        { description: "Compressor", quantity: 1, unitPrice: 1000, partId: peca.id },
        { description: "Mão de obra", quantity: 1, unitPrice: 200 },
      ]),
    })
    await reconciliarComissao(testDb.db, tenant.id, os.id)

    expect(Number((await testDb.db.expense.findFirst({ where: { orderId: os.id } }))?.amount)).toBe(120)
  })
})
