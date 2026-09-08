import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

async function seedTenant(name: string) {
  return testDb.db.tenant.create({ data: { name } })
}

async function seedQuote(tenantId: string, overrides: Partial<{ status: string; number: number }> = {}) {
  return testDb.db.quote.create({
    data: {
      tenantId,
      number: overrides.number ?? 1,
      clientName: "Cliente Teste",
      description: "Serviço de teste",
      status: (overrides.status as never) ?? "SENT",
    },
  })
}

// Cobre o achado da 2ª auditoria de segurança (20/07/2026): quotes.ts não
// tinha NENHUMA checagem de papel — qualquer TECHNICIAN podia deletar ou
// forjar aprovação/rejeição de qualquer orçamento do tenant.
describe("quotes — checagem de papel", () => {
  it("updateQuoteStatus bloqueia TECHNICIAN", async () => {
    const tenant = await seedTenant("Empresa")
    const quote = await seedQuote(tenant.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { updateQuoteStatus } = await import("@/actions/quotes")
    await updateQuoteStatus(quote.id, "APPROVED")

    const unchanged = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(unchanged?.status).toBe("SENT")
  })

  it("updateQuoteStatus permite OWNER", async () => {
    const tenant = await seedTenant("Empresa")
    const quote = await seedQuote(tenant.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { updateQuoteStatus } = await import("@/actions/quotes")
    await updateQuoteStatus(quote.id, "APPROVED")

    const updated = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(updated?.status).toBe("APPROVED")
  })

  it("updateQuoteStatus permite ADMIN", async () => {
    const tenant = await seedTenant("Empresa")
    const quote = await seedQuote(tenant.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "ADMIN" })
    const { updateQuoteStatus } = await import("@/actions/quotes")
    await updateQuoteStatus(quote.id, "REJECTED")

    const updated = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(updated?.status).toBe("REJECTED")
  })

  it("deleteQuote bloqueia TECHNICIAN e não apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const quote = await seedQuote(tenant.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { deleteQuote } = await import("@/actions/quotes")

    // Bloqueado por papel: a função retorna sem chamar redirect() nesse
    // caso (só existe no fluxo de sucesso) — não deve lançar nada.
    await deleteQuote(quote.id)

    const stillExists = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(stillExists).not.toBeNull()
  })

  it("deleteQuote permite OWNER e apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const quote = await seedQuote(tenant.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { deleteQuote } = await import("@/actions/quotes")

    await expect(deleteQuote(quote.id)).rejects.toThrow("REDIRECT:/quotes")

    const stillExists = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(stillExists).toBeNull()
  })
})

describe("quotes — isolamento entre tenants", () => {
  it("getQuote não retorna orçamento de outro tenant", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    const quote = await seedQuote(tenantA.id)

    mockGetTenant.mockResolvedValue({ tenantId: tenantB.id, userId: "u1", role: "OWNER" })
    const { getQuote } = await import("@/actions/quotes")
    const result = await getQuote(quote.id)

    expect(result).toBeNull()
  })
})
