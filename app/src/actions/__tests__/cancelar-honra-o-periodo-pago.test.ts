import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Cancelar a assinatura não tira o acesso que já foi pago.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `cancelSubscription` gravava `subscriptionStatus: "CANCELLED"` no instante do
// clique, e `hasActiveSubscription` devolvia falso para CANCELLED — o acesso
// morria ali, para a equipe inteira, inclusive os técnicos em campo.
//
// Só que o contrato que o cliente assina diz, na cláusula 6, "o acesso
// permanece disponível até o fim do período já pago"; os Termos repetem; e os
// dois dizem que valor pago NÃO é reembolsado. Quem pagava dia 01 e cancelava
// dia 05 perdia 25 dias comprados, com o contrato assinado dizendo o contrário.
//
// A decisão do dono foi honrar o contrato. (Auditoria de 13/09/2026.)
//
// De quebra, `cancelSubscription` zerava o `planId` — o terceiro caminho que
// produzia "empresa sem plano", que caía no PERMISSIVO e entregava tudo.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
  vi.doMock("react", async () => {
    const real = await vi.importActual<typeof import("react")>("react")
    return { ...real, cache: (fn: unknown) => fn }
  })
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

const auth = () => import("@/lib/auth")

async function cancelada(fimDoPeriodo: Date) {
  const plano = await testDb.db.plan.create({
    data: { name: "Pro", slug: "pro", priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", subscriptionStatus: "CANCELLED", planId: plano.id },
  })
  await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plano.id,
      status: "CANCELLED",
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date(fimDoPeriodo.getTime() - 30 * 864e5),
      currentPeriodEnd: fimDoPeriodo,
      cancelledAt: new Date(),
    },
  })
  return tenant
}

const daquiA = (dias: number) => new Date(Date.now() + dias * 864e5)

describe("quem cancelou continua até o fim do que pagou", () => {
  it("dentro do período pago, ENTRA", async () => {
    // O caso central: pagou 30 dias, usou 5, cancelou. Os 25 restantes são
    // dele — os Termos dizem que o valor não volta.
    const t = await cancelada(daquiA(25))
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(true)
  })

  it("passado o período, NÃO entra", async () => {
    const t = await cancelada(daquiA(-1))
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(false)
  })

  it("e a trava das Server Actions segue a mesma regra", async () => {
    // `requireActiveSubscription` é chamada em toda ação sensível. Uma regra
    // que valesse só no layout deixaria quem cancelou liberado para olhar e
    // bloqueado para trabalhar — pior que os dois extremos.
    const t = await cancelada(daquiA(25))
    const { requireActiveSubscription } = await auth()

    await expect(requireActiveSubscription(t.id)).resolves.toBeUndefined()
  })

  it("CANCELLED sem nenhuma assinatura não entra", async () => {
    // Estado das empresas canceladas antes desta mudança, e de qualquer tenant
    // marcado à mão. Sem data que garanta período pago, não há o que honrar.
    const t = await testDb.db.tenant.create({
      data: { name: "Sem assinatura", subscriptionStatus: "CANCELLED" },
    })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(false)
  })
})

describe("o plano sobrevive ao cancelamento", () => {
  it("a empresa cancelada ainda tem os limites do plano que contratou", async () => {
    // Zerar o planId fazia a empresa cair no PERMISSIVO durante o período que
    // o contrato garante — entregando MAIS do que ela comprou, justamente
    // enquanto ela está de saída.
    const t = await cancelada(daquiA(25))
    const { getLimites } = await import("@/lib/plan")

    const l = await getLimites(t.id)
    expect(l.maxUsuarios).toBe(10)
    expect(l.maxNfseMes).toBe(70)
    expect(l.recursos).not.toContain("api")
  })
})
