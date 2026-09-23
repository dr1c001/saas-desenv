import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { abasDeMentira } from "@/test-utils/abas-de-mentira"

// Quem está em ATRASO não conseguia cancelar — e continuava sendo faturado.
//
// `cancelSubscription` só procurava assinatura ACTIVE. Mas o webhook rebaixa
// para PAST_DUE assim que uma cobrança falha, e ela nasce PENDING até o
// primeiro pagamento; nos dois estados a assinatura na Asaas CONTINUA gerando
// fatura todo ciclo. O cliente cujo boleto venceu entrava em Cobrança para
// cancelar — como a cláusula de rescisão manda — e não achava o botão; se
// chamasse a Action direto, ela voltava calada, sem erro e sem mensagem. O
// único jeito de parar era falar com o suporte.
//
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockCancelarNaAsaas = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    // A cobrança segue a ABA desde 22/09/2026: a empresa marca e desmarca
    // "Assinatura" por cargo. A regra real, sem banco, está em
    // test-utils/abas-de-mentira.ts — dono e administrador passam sempre.
    ...abasDeMentira(mockGetTenant),
  }))
  vi.doMock("@/lib/asaas", () => ({
    asaas: { cancelSubscription: mockCancelarNaAsaas, createCustomer: vi.fn(), createSubscription: vi.fn() },
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockCancelarNaAsaas.mockReset().mockResolvedValue(undefined)
})

async function empresaCom(status: "ACTIVE" | "PAST_DUE" | "PENDING" | "TRIAL" | "CANCELLED") {
  const plano = await testDb.db.plan.create({
    data: { name: "Pro", slug: `pro-${Math.random().toString(36).slice(2, 8)}`, priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", subscriptionStatus: status, planId: plano.id },
  })
  const sub =
    status === "TRIAL"
      ? null
      : await testDb.db.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plano.id,
            asaasId: `sub_${tenant.id}`,
            status,
            billingCycle: "MONTHLY",
            currentPeriodStart: new Date("2026-09-01T12:00:00Z"),
            currentPeriodEnd: new Date("2026-10-01T12:00:00Z"),
          },
        })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "dono", role: "OWNER" })
  return { tenant, sub, plano }
}

const cancelar = async () => {
  const { cancelSubscription } = await import("@/actions/billing")
  return cancelSubscription()
}

const releu = (id: string) => testDb.db.subscription.findUnique({ where: { id } })

describe("quem está sendo faturado pode cancelar", () => {
  it.each(["ACTIVE", "PAST_DUE", "PENDING"] as const)(
    "assinatura em %s: cancela de verdade, na Asaas e aqui",
    async (status) => {
      const { tenant, sub } = await empresaCom(status)

      await cancelar()

      expect(mockCancelarNaAsaas).toHaveBeenCalledWith(sub!.asaasId)
      expect((await releu(sub!.id))!.status).toBe("CANCELLED")
      expect((await testDb.db.tenant.findUnique({ where: { id: tenant.id } }))!.subscriptionStatus).toBe("CANCELLED")
    }
  )

  it("o PLANO sobrevive — o período pago ainda é do cliente", async () => {
    const { tenant, plano } = await empresaCom("PAST_DUE")

    await cancelar()

    expect((await testDb.db.tenant.findUnique({ where: { id: tenant.id } }))!.planId).toBe(plano.id)
  })
})

describe("quem não tem o que cancelar", () => {
  it("em TESTE GRÁTIS, diz isso em vez de voltar calada", async () => {
    // Não há assinatura na Asaas, não há cobrança nenhuma — e marcar o tenant
    // como CANCELLED bloquearia quem só está testando.
    await empresaCom("TRIAL")

    await expect(cancelar()).rejects.toThrow("nadaACancelar")

    expect(mockCancelarNaAsaas).not.toHaveBeenCalled()
  })

  it("já CANCELADA, também diz", async () => {
    await empresaCom("CANCELLED")

    await expect(cancelar()).rejects.toThrow("nadaACancelar")
  })
})

describe("a Asaas recusando", () => {
  it("NÃO marca como cancelado aqui — senão a tela diz cancelado e a cobrança segue", async () => {
    const { sub } = await empresaCom("PAST_DUE")
    mockCancelarNaAsaas.mockRejectedValue(new Error("Asaas fora do ar"))

    await expect(cancelar()).rejects.toThrow()

    expect((await releu(sub!.id))!.status).toBe("PAST_DUE")
  })
})

describe("o botão aparece para quem pode cancelar", () => {
  // Estrutural: a tela é Server Component com meia dúzia de dependências, e o
  // defeito era a CONDIÇÃO — o botão só existia para ACTIVE.
  it("a tela de cobrança mostra o botão nos três estados faturáveis", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/billing/page.tsx", "utf-8")
    )
    expect(fonte).toContain('["ACTIVE", "PAST_DUE", "PENDING"].includes')
    expect(fonte).not.toMatch(/billing\?\.subscriptionStatus === "ACTIVE" && \(\s*\n\s*<div className="pt-2">/)
  })
})
