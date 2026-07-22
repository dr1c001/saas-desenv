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

describe("clients — isolamento entre tenants", () => {
  it("getClient não retorna cliente de outro tenant (IDOR)", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    const client = await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente da A" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantB.id, userId: "u1", role: "OWNER" })
    const { getClient } = await import("@/actions/clients")
    const result = await getClient(client.id)

    expect(result).toBeNull()
  })

  it("getClient retorna o cliente pro tenant dono", async () => {
    const tenantA = await seedTenant("Empresa A")
    const client = await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente da A" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantA.id, userId: "u1", role: "OWNER" })
    const { getClient } = await import("@/actions/clients")
    const result = await getClient(client.id)

    expect(result?.id).toBe(client.id)
  })

  it("getClients só lista clientes do próprio tenant", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente A1" } })
    await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente A2" } })
    await testDb.db.client.create({ data: { tenantId: tenantB.id, name: "Cliente B1" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantA.id, userId: "u1", role: "OWNER" })
    const { getClients } = await import("@/actions/clients")
    const result = await getClients()

    expect(result).toHaveLength(2)
    expect(result.every((c) => c.name.startsWith("Cliente A"))).toBe(true)
  })
})

describe("clients — checagem de papel", () => {
  it("deleteClient bloqueia TECHNICIAN e não apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).not.toBeNull()
  })

  it("deleteClient permite OWNER e apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).toBeNull()
  })

  it("deleteClient permite ADMIN e apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "ADMIN" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).toBeNull()
  })
})
