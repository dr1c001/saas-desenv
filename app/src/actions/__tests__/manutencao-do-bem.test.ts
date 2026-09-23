import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A manutenção que dá histórico ao BEM.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `MaintenanceOrder.assetId` existia no schema, com a regra escrita nele: "dá
// histórico à van: quantas vezes parou, quanto já custou, e quando". `getBem`
// fazia o `include`, `excluirBem` contava `_count.maintenance` para recusar a
// exclusão, e havia três textos de tela em pt e en sobre isso.
//
// NENHUMA linha de produção gravava o campo. O formulário de manutenção não
// oferecia escolher o bem, e a Action não lia o campo.
//
// Duas consequências, e a primeira é a que dói: `bem._count.maintenance` era
// sempre zero, então `excluirBem` NUNCA devolvia "temHistorico" — o dono apagava
// a van com três manutenções registradas sem o aviso que a mensagem prometia.
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
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(false),
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next/navigation", () => ({
    redirect: (url: string) => {
      throw new Error(`REDIRECT:${url}`)
    },
  }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/maintenance")

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
  const van = await testDb.db.asset.create({
    data: {
      tenantId: tenant.id,
      name: "Van 01",
      category: "VEICULO",
      purchaseValue: 80000,
      purchasedAt: new Date("2025-01-10T12:00:00Z"),
    },
  })
  return { tenant, van }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  fd.set("title", "Revisão dos 40 mil")
  fd.set("status", "OPEN")
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

describe("criar manutenção ligada a um bem", () => {
  it("grava o vínculo com o bem", async () => {
    const { tenant, van } = await cenario()
    const { createMaintenanceOrder } = await acoes()

    await createMaintenanceOrder({}, form({ assetId: van.id })).catch(() => null)

    const om = await testDb.db.maintenanceOrder.findFirst({ where: { tenantId: tenant.id } })
    expect(om?.assetId).toBe(van.id)
  })

  it("e o bem passa a contar essa manutenção", async () => {
    // É esta contagem que `excluirBem` consulta para recusar a exclusão.
    const { van } = await cenario()
    const { createMaintenanceOrder } = await acoes()

    await createMaintenanceOrder({}, form({ assetId: van.id })).catch(() => null)

    const bem = await testDb.db.asset.findUnique({
      where: { id: van.id },
      include: { _count: { select: { maintenance: true } } },
    })
    expect(bem?._count.maintenance).toBe(1)
  })

  it("manutenção AVULSA continua possível — é o caminho normal", async () => {
    // Nem toda OM é de um bem cadastrado.
    const { tenant } = await cenario()
    const { createMaintenanceOrder } = await acoes()

    await createMaintenanceOrder({}, form({})).catch(() => null)

    const om = await testDb.db.maintenanceOrder.findFirst({ where: { tenantId: tenant.id } })
    expect(om).not.toBeNull()
    expect(om?.assetId).toBeNull()
  })

  it("bem de OUTRA empresa é recusado", async () => {
    // Mesma checagem de posse que o `providerId` já tinha, e pelo mesmo motivo:
    // um id vindo do formulário sem validar tenant ligaria a OM ao bem alheio.
    const { tenant } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Vizinha" } })
    const alheio = await testDb.db.asset.create({
      data: {
        tenantId: outra.id,
        name: "Van da vizinha",
        category: "VEICULO",
        purchaseValue: 1,
        purchasedAt: new Date("2025-01-10T12:00:00Z"),
      },
    })
    const { createMaintenanceOrder } = await acoes()

    const r = await createMaintenanceOrder({}, form({ assetId: alheio.id })).catch(() => null)

    expect(r?.message).toBe("assetNotFound")
    expect(await testDb.db.maintenanceOrder.count({ where: { tenantId: tenant.id } })).toBe(0)
  })
})

describe("o formulário oferece o campo", () => {
  // Estrutural: a Action é metade do caminho. Sem o campo na tela, ela nunca
  // recebe o id — que foi exatamente o estado anterior.
  it("maintenance-form.tsx tem o select de bem", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/maintenance/maintenance-form.tsx", "utf-8")
    )
    expect(fonte).toContain('name="assetId"')
  })

  it("a tela de nova manutenção carrega os bens", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/maintenance/new/page.tsx", "utf-8")
    )
    expect(fonte).toContain("getBens")
    expect(fonte).toContain("bens=")
  })
})
