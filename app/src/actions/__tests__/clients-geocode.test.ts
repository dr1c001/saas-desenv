import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockGeocode = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/geocode", () => ({ geocodeAddress: mockGeocode }))
  // A fila fala com o provedor; aqui só interessa o comportamento da edição.
  vi.doMock("@/lib/geocode-fila", () => ({ avancarFila: vi.fn().mockResolvedValue({}) }))
  // updateClient termina em redirect(), que lança por natureza.
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  // getTranslations não roda fora do runtime do Next.
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
  mockGeocode.mockReset()
})

const ENDERECO = { street: "Rua das Flores", number: "100", city: "Piracicaba", state: "SP" }

async function seedCliente(coords: { latitude: number; longitude: number } | null) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Empresa" } })
  const client = await testDb.db.client.create({
    data: {
      tenantId: tenant.id,
      name: "Cliente",
      phone: "1199990000",
      address: { create: { ...ENDERECO, ...(coords ?? {}) } },
    },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
  return client
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

const dados = (extra: Record<string, string> = {}) =>
  form({ name: "Cliente", status: "ACTIVE", ...ENDERECO, ...extra })

describe("updateClient e a coordenada do mapa", () => {
  it("editar só o telefone não consulta o geocodificador", async () => {
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ phone: "1188887777" }))

    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it("editar só o telefone NÃO apaga a coordenada existente", async () => {
    // O defeito que este teste tranca: quando o geocodificador falhava (tempo
    // limite, provedor fora do ar), o update gravava null e o cliente sumia do
    // mapa por causa de uma edição que nada tinha a ver com o endereço.
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    mockGeocode.mockResolvedValue(null)
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ phone: "1188887777" }))

    const addr = await testDb.db.address.findUnique({ where: { clientId: client.id } })
    expect(addr?.latitude).toBe(-22.72)
    expect(addr?.longitude).toBe(-47.64)
  })

  it("mudar a rua consulta e grava a coordenada nova", async () => {
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    mockGeocode.mockResolvedValue({ latitude: -23.5, longitude: -46.6 })
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ street: "Rua Nova" }))

    expect(mockGeocode).toHaveBeenCalledOnce()
    const addr = await testDb.db.address.findUnique({ where: { clientId: client.id } })
    expect(addr?.latitude).toBe(-23.5)
  })

  it("mudar a cidade também conta como endereço novo", async () => {
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    mockGeocode.mockResolvedValue({ latitude: -23.5, longitude: -46.6 })
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ city: "Campinas" }))

    expect(mockGeocode).toHaveBeenCalledOnce()
  })

  it("mudar só o complemento não vale uma consulta", async () => {
    // Complemento e CEP não entram na consulta de geocodificação, então não
    // mudam o pino — consultar seria gastar crédito à toa.
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ complement: "Apto 42", zipCode: "13400-000" }))

    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it("endereço novo devolve o cliente pra fila", async () => {
    // Quem esgotou as tentativas por cidade digitada errada precisa ganhar
    // chance nova quando a digitação for corrigida.
    const client = await seedCliente({ latitude: -22.72, longitude: -47.64 })
    await testDb.db.address.update({
      where: { clientId: client.id },
      data: { geocodeTries: 6 },
    })
    mockGeocode.mockResolvedValue(null)
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ city: "Piracicaba " + "corrigida" }))

    const addr = await testDb.db.address.findUnique({ where: { clientId: client.id } })
    expect(addr?.geocodeTries).toBe(0)
  })

  it("cliente sem coordenada e sem mudança de endereço não consulta à toa", async () => {
    // A fila do cron cuida desses; consultar aqui de novo só gastaria crédito.
    const client = await seedCliente(null)
    const { updateClient } = await import("@/actions/clients")

    await updateClient(client.id, {}, dados({ phone: "1188887777" }))

    expect(mockGeocode).not.toHaveBeenCalled()
    const addr = await testDb.db.address.findUnique({ where: { clientId: client.id } })
    expect(addr?.latitude).toBeNull()
  })
})
