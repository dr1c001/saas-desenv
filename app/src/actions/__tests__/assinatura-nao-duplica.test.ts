import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { RecusaExterna } from "@/lib/tempo-limite"

// Uma falha no meio de assinar não pode gerar DUAS cobranças recorrentes.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// A ordem era: cria a assinatura REAL na Asaas, e só depois grava no banco.
// Entre as duas não havia nada — nem registro de intenção, nem compensação.
//
// Se a gravação local falhasse (banco em failover, pool esgotado) ou a função
// morresse por tempo, a Asaas já tinha a cobrança mensal e o nosso banco não
// tinha nada. A guarda de duplicidade procura Subscription no NOSSO banco, não
// achava, e o dono — que viu um erro na tela — clicava de novo: SEGUNDA
// assinatura recorrente no mesmo cartão. Duas cobranças mensais paralelas, e o
// sistema só conhecia a segunda; a primeira cobrava para sempre sem aparecer em
// tela nenhuma.
//
// A correção é a linha local nascer ANTES da chamada. (Auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockCriarAssinatura = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/asaas", () => ({
    asaas: {
      createCustomer: vi.fn().mockResolvedValue({ id: "cus-1" }),
      updateCustomer: vi.fn().mockResolvedValue({}),
      createSubscription: mockCriarAssinatura,
      getFirstInvoiceUrl: vi.fn().mockResolvedValue(null),
    },
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
  mockCriarAssinatura.mockReset().mockResolvedValue({ id: "asaas-sub-1" })
})

const acoes = () => import("@/actions/billing")

async function cenario() {
  const plano = await testDb.db.plan.create({
    data: { name: "Pro", slug: "pro", priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", document: "12345678000190", subscriptionStatus: "TRIAL" },
  })
  const dono = await testDb.db.user.create({
    data: { id: "dono", tenantId: tenant.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER" })
  return { tenant, plano }
}

/** `subscribeToPlan` termina em redirect, que o setup transforma em exceção. */
async function assinar(planId: string, ciclo = "MONTHLY") {
  const { subscribeToPlan } = await acoes()
  const fd = new FormData()
  fd.set("planId", planId)
  fd.set("cycle", ciclo)
  return subscribeToPlan(fd).catch((e) => e)
}

describe("assinar um plano", () => {
  it("a linha local existe ANTES de a Asaas ser chamada", async () => {
    // O centro da correção. Se a Asaas for chamada primeiro, uma falha na
    // gravação deixa a cobrança viva lá fora e invisível aqui.
    const { tenant, plano } = await cenario()
    let haviaLinhaLocal = false
    mockCriarAssinatura.mockImplementationOnce(async () => {
      haviaLinhaLocal =
        (await testDb.db.subscription.count({ where: { tenantId: tenant.id } })) > 0
      return { id: "asaas-sub-1" }
    })

    await assinar(plano.id)

    expect(haviaLinhaLocal).toBe(true)
  })

  it("recusa da Asaas NÃO deixa linha órfã bloqueando nova tentativa", async () => {
    // Se a Asaas disse não, não há cobrança lá fora — e a pessoa precisa poder
    // tentar de novo.
    const { tenant, plano } = await cenario()
    mockCriarAssinatura.mockRejectedValueOnce(new RecusaExterna("Asaas /subscriptions", 400, "cartão recusado"))

    await assinar(plano.id)

    expect(await testDb.db.subscription.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it("Asaas SEM resposta conclusiva MANTÉM a linha — a assinatura pode ter sido criada lá", async () => {
    // lib/asaas.ts tem timeout desde 15/09/2026. Apagar a linha num "não sei"
    // deixaria a guarda de duplicidade cega, e o clique seguinte criaria a
    // SEGUNDA cobrança recorrente no cartão. (Auditoria de 13/09/2026.)
    const { tenant, plano } = await cenario()
    mockCriarAssinatura.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })
    )

    await assinar(plano.id)

    expect(await testDb.db.subscription.count({ where: { tenantId: tenant.id } })).toBe(1)
    // E a segunda tentativa esbarra na linha, em vez de criar outra na Asaas.
    await assinar(plano.id)
    expect(mockCriarAssinatura).toHaveBeenCalledTimes(1)
  })

  it("dando certo, a linha guarda o id da Asaas", async () => {
    const { tenant, plano } = await cenario()

    await assinar(plano.id)

    const sub = await testDb.db.subscription.findFirst({ where: { tenantId: tenant.id } })
    expect(sub?.asaasId).toBe("asaas-sub-1")
    expect(sub?.status).toBe("PENDING")
  })

  it("com assinatura PENDING já existente, nem chega a chamar a Asaas", async () => {
    // A guarda de duplicidade. É ela que a linha local antecipada torna eficaz:
    // uma tentativa anterior que falhou depois da Asaas agora É enxergada.
    const { tenant, plano } = await cenario()
    await testDb.db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plano.id,
        status: "PENDING",
        billingCycle: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
      },
    })

    await assinar(plano.id)

    expect(mockCriarAssinatura).not.toHaveBeenCalled()
  })
})
