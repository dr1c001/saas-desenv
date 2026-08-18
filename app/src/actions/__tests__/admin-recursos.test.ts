import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Esta ação concede recurso pago a empresa cliente e é a substituta de duas
// edições manuais no banco de produção. Se ela errar, o erro é caro nos dois
// sentidos: liberar de graça o que se cobra, ou tirar de quem já usava.

let testDb: TestDatabase
const mockRequireSuperAdmin = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/admin", async () => {
    const real = await vi.importActual<typeof import("@/lib/admin")>("@/lib/admin")
    return {
      ...real,
      requireSuperAdmin: mockRequireSuperAdmin,
      registrarAcaoAdmin: async (
        adminEmail: string,
        action: string,
        tenantId: string,
        detail?: string
      ) => {
        await testDb.db.adminAuditLog.create({
          data: { adminEmail, action: action as never, tenantId, detail: detail ?? null },
        })
      },
    }
  })
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockRequireSuperAdmin.mockReset()
  mockRequireSuperAdmin.mockResolvedValue({ email: "dono@servicoos.com.br", name: "Dono", role: "DONO" })
})

async function seed(planoSlug: string | null, extras: string[] = []) {
  const plano = planoSlug
    ? await testDb.db.plan.create({
        data: {
          name: planoSlug,
          slug: planoSlug,
          priceMonthly: 97,
          priceYearly: 970,
          features: [],
        },
      })
    : null
  return testDb.db.tenant.create({
    data: { name: "Empresa", planId: plano?.id ?? null, extraFeatures: extras },
  })
}

const extrasDe = async (id: string) =>
  (await testDb.db.tenant.findUnique({ where: { id }, select: { extraFeatures: true } }))!
    .extraFeatures

describe("conceder recurso avulso", () => {
  it("concede o que foi marcado", async () => {
    const t = await seed("starter")
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap"])

    expect(await extrasDe(t.id)).toEqual(["gpsMap"])
  })

  it("revoga o que foi desmarcado", async () => {
    // A tela manda o estado final, então tirar da lista tem que remover.
    const t = await seed("starter", ["gpsMap", "signature"])
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["signature"])

    expect(await extrasDe(t.id)).toEqual(["signature"])
  })

  it("ignora valor que não é recurso conhecido", async () => {
    // Sem esta peneira, um valor errado viraria texto morto no banco: não
    // libera nada e ninguém descobre por que "concedi e não apareceu".
    const t = await seed("starter")
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap", "voarSozinho", ""])

    expect(await extrasDe(t.id)).toEqual(["gpsMap"])
  })

  it("não duplica o que o plano já dá", async () => {
    // Guardar duplicado faria a lista crescer sozinha a cada upgrade e
    // mentiria sobre o que de fato foi concedido à mão.
    const t = await seed("pro")
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap", "nfse", "signature"])

    expect(await extrasDe(t.id)).toEqual([])
  })

  it("não repete o mesmo recurso quando vem duplicado da tela", async () => {
    const t = await seed("starter")
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap", "gpsMap"])

    expect(await extrasDe(t.id)).toEqual(["gpsMap"])
  })

  it("limpa valor herdado de edição manual antiga", async () => {
    const t = await seed("starter", ["signature", "recursoQueNaoExisteMais"])
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["signature"])

    expect(await extrasDe(t.id)).toEqual(["signature"])
  })

  it("registra no log de auditoria o que entrou e o que saiu", async () => {
    // O motivo de a tela existir: sem registro, daqui a seis meses ninguém
    // sabe quem liberou o quê.
    const t = await seed("starter", ["signature"])
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap"])

    const log = await testDb.db.adminAuditLog.findFirst({ where: { tenantId: t.id } })
    expect(log?.action).toBe("alterar_recursos")
    expect(log?.adminEmail).toBe("dono@servicoos.com.br")
    expect(log?.detail).toContain("+gpsMap")
    expect(log?.detail).toContain("-signature")
  })

  it("não registra nada quando nada mudou", async () => {
    // Log cheio de linha sem mudança esconde as que importam.
    const t = await seed("starter", ["gpsMap"])
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await alterarRecursosExtras(t.id, ["gpsMap"])

    expect(await testDb.db.adminAuditLog.count()).toBe(0)
  })

  it("exige a permissão de conceder recurso", async () => {
    const t = await seed("starter")
    mockRequireSuperAdmin.mockRejectedValue(new Error("Seu perfil não tem permissão para esta ação."))
    const { alterarRecursosExtras } = await import("@/actions/admin")

    await expect(alterarRecursosExtras(t.id, ["gpsMap"])).rejects.toThrow("permissão")
    expect(mockRequireSuperAdmin).toHaveBeenCalledWith("concederRecurso")
  })

  it("recusa empresa que não existe", async () => {
    const { alterarRecursosExtras } = await import("@/actions/admin")
    await expect(alterarRecursosExtras("nao-existe", ["gpsMap"])).rejects.toThrow("não encontrada")
  })
})
