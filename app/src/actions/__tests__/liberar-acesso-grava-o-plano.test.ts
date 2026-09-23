import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// "Liberar acesso" no painel do dono precisa gravar o PLANO.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// A função gravava só `subscriptionStatus: "ACTIVE"` e nunca tocava em
// `planId`. E empresa sem plano caía no PERMISSIVO de lib/plan.ts: recursos
// TODOS e as três cotas em `null`.
//
// Não era caso de borda. No fluxo que criou esta função — cliente pagou e ficou
// preso em PENDING porque o webhook falhou — o tenant NUNCA teve `planId`, já
// que quem grava esse campo é só o webhook da Asaas. Ou seja: TODA empresa
// destravada à mão ganhava o pacote inteiro, de graça e para sempre, incluindo
// a API do Enterprise e nota fiscal sem teto.
//
// `trocarPlano`, a outra liberação manual do mesmo painel, sempre gravou o
// plano. Esta era a única que não. (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockRequireSuperAdmin = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/admin", () => ({
    requireSuperAdmin: mockRequireSuperAdmin,
    registrarAcaoAdmin: vi.fn().mockResolvedValue(undefined),
    EMAIL_FUNDADOR: "dono@ex.com",
    COOKIE_IMPERSONACAO: "admin_ver_como",
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockRequireSuperAdmin.mockReset().mockResolvedValue({ email: "dono@ex.com" })
})

const admin = () => import("@/actions/admin")

async function cenario(opts: { planoDoTenant?: boolean } = {}) {
  const plano = await testDb.db.plan.create({
    data: { name: "Starter", slug: "starter", priceMonthly: 97, priceYearly: 970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Desentupidora Silva",
      subscriptionStatus: "PENDING",
      ...(opts.planoDoTenant ? { planId: plano.id } : {}),
    },
  })
  await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plano.id,
      status: "PENDING",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
  })
  return { tenant, plano }
}

describe("liberar acesso", () => {
  it("grava o plano da assinatura quando a empresa não tem plano", async () => {
    // O caso real: cliente pagou, o webhook falhou, o tenant ficou PENDING e
    // sem planId. Antes, destravar dava o pacote inteiro.
    const { tenant, plano } = await cenario()
    const { liberarAcesso } = await admin()

    await liberarAcesso(tenant.id)

    const depois = await testDb.db.tenant.findUnique({ where: { id: tenant.id } })
    expect(depois?.subscriptionStatus).toBe("ACTIVE")
    expect(depois?.planId).toBe(plano.id)
  })

  it("e as cotas passam a ser as do plano, não as infinitas", async () => {
    // O efeito que importa. Sem o planId, getLimites caía no PERMISSIVO.
    const { tenant } = await cenario()
    const { liberarAcesso } = await admin()
    await liberarAcesso(tenant.id)

    vi.doMock("react", async () => {
      const real = await vi.importActual<typeof import("react")>("react")
      return { ...real, cache: (fn: unknown) => fn }
    })
    const { getLimites } = await import("@/lib/plan")

    const l = await getLimites(tenant.id)
    expect(l.maxUsuarios).toBe(3)
    expect(l.maxNfseMes).toBe(8)
    expect(l.recursos).not.toContain("api")
  })

  it("NÃO rebaixa quem já tem plano", async () => {
    // Destravar não é trocar de plano. Quem já tem o seu não perde nada por um
    // clique de suporte.
    const { tenant, plano } = await cenario({ planoDoTenant: true })
    const outro = await testDb.db.plan.create({
      data: { name: "Pro", slug: "pro", priceMonthly: 197, priceYearly: 1970 },
    })
    await testDb.db.subscription.updateMany({
      where: { tenantId: tenant.id },
      data: { planId: outro.id },
    })
    const { liberarAcesso } = await admin()

    await liberarAcesso(tenant.id)

    const depois = await testDb.db.tenant.findUnique({ where: { id: tenant.id } })
    expect(depois?.planId).toBe(plano.id)
  })

  it("a assinatura também vira ACTIVE, com os avisos zerados", async () => {
    // Comportamento que já existia e não pode ter sido perdido na correção.
    const { tenant } = await cenario()
    await testDb.db.subscription.updateMany({
      where: { tenantId: tenant.id },
      data: { pastDueWarningsSent: 3 },
    })
    const { liberarAcesso } = await admin()

    await liberarAcesso(tenant.id)

    const sub = await testDb.db.subscription.findFirst({ where: { tenantId: tenant.id } })
    expect(sub?.status).toBe("ACTIVE")
    expect(sub?.pastDueWarningsSent).toBe(0)
  })
})
