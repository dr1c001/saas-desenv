import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { abasDeMentira } from "@/test-utils/abas-de-mentira"

// Trocar de plano pelo painel — o efeito, com banco.
//
// A regra (quem pode, para onde, quando vale) tem teste próprio, puro, em
// lib/__tests__/troca-de-plano.test.ts. Aqui se prova o que a Action FAZ:
// o que muda no banco, o que vai para a Asaas, e o que espera o fim do
// período pago. (Achado na auditoria de 13/09/2026, verbete 3.5 do manual.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockAtualizarAsaas = vi.fn()

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
    asaas: {
      updateSubscription: mockAtualizarAsaas,
      createCustomer: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
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
  mockAtualizarAsaas.mockReset().mockResolvedValue(undefined)
})

const FIM = new Date("2026-10-01T12:00:00Z")

async function cenario(opcoes: { status?: "ACTIVE" | "PAST_DUE" | "PENDING"; combinado?: number } = {}) {
  const marca = Math.random().toString(36).slice(2, 8)
  const starter = await testDb.db.plan.create({
    data: { name: "Starter", slug: `starter-${marca}`, priceMonthly: 97, priceYearly: 970 },
  })
  const pro = await testDb.db.plan.create({
    data: { name: "Pro", slug: `pro-${marca}`, priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      planId: starter.id,
      subscriptionStatus: "ACTIVE",
      customPriceMonthly: opcoes.combinado ?? null,
    },
  })
  const sub = await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: starter.id,
      asaasId: `sub_${tenant.id}`,
      status: opcoes.status ?? "ACTIVE",
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date("2026-09-01T12:00:00Z"),
      currentPeriodEnd: FIM,
    },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "dono", role: "OWNER" })
  return { tenant, sub, starter, pro }
}

function form(planId: string) {
  const fd = new FormData()
  fd.set("planId", planId)
  return fd
}

/**
 * O `redirect` do Next LANÇA — e o mock do harness (test-utils/setup.ts) o
 * transforma num Error("REDIRECT:..."). O caminho de sucesso termina em
 * redirect, então engolir o de SUCESSO é o que deixa o teste ler o banco
 * depois. Qualquer outro sobe: é assim que os casos de recusa afirmam o motivo.
 */
async function semORedirectDeSucesso(acao: () => Promise<unknown>) {
  try {
    await acao()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes("success=1")) throw e
  }
}

const trocar = async (planId: string) => {
  const { trocarDePlano } = await import("@/actions/billing")
  return semORedirectDeSucesso(() => trocarDePlano(form(planId)))
}

const leia = async (tenantId: string, subId: string) => ({
  tenant: await testDb.db.tenant.findUnique({ where: { id: tenantId } }),
  sub: await testDb.db.subscription.findUnique({ where: { id: subId } }),
})

describe("SUBIR de plano", () => {
  it("vale na hora: acesso novo já, e a Asaas passa a cobrar o valor novo", async () => {
    const { tenant, sub, pro } = await cenario()

    await trocar(pro.id)

    const { tenant: t, sub: s } = await leia(tenant.id, sub.id)
    expect(s!.planId).toBe(pro.id)
    expect(t!.planId).toBe(pro.id)
    // Nada fica agendado: já valeu.
    expect(s!.pendingPlanId).toBeNull()
    expect(mockAtualizarAsaas).toHaveBeenCalledWith(sub.asaasId, {
      value: 197,
      updatePendingPayments: true,
    })
  })

  it("o período já pago NÃO é recobrado — a data de fim não muda", async () => {
    const { tenant, sub, pro } = await cenario()

    await trocar(pro.id)

    const { sub: s } = await leia(tenant.id, sub.id)
    expect(s!.currentPeriodEnd).toEqual(FIM)
  })
})

describe("DESCER de plano", () => {
  it("é AGENDADO: o acesso continua no plano pago até o fim do período", async () => {
    const { tenant, sub, starter, pro } = await cenario()
    // Primeiro sobe, para depois descer.
    await trocar(pro.id)
    mockAtualizarAsaas.mockClear()

    await trocar(starter.id)

    const { tenant: t, sub: s } = await leia(tenant.id, sub.id)
    expect(s!.pendingPlanId).toBe(starter.id)
    // O acesso NÃO mudou: é o que o contrato garante.
    expect(s!.planId).toBe(pro.id)
    expect(t!.planId).toBe(pro.id)
  })

  it("mas a próxima fatura já sai pelo valor novo", async () => {
    const { sub, starter, pro } = await cenario()
    await trocar(pro.id)
    mockAtualizarAsaas.mockClear()

    await trocar(starter.id)

    expect(mockAtualizarAsaas).toHaveBeenCalledWith(sub.asaasId, {
      value: 97,
      updatePendingPayments: true,
    })
  })

  it("e dá para desfazer antes de valer — o valor na Asaas volta", async () => {
    const { tenant, sub, starter, pro } = await cenario()
    await trocar(pro.id)
    await trocar(starter.id)
    mockAtualizarAsaas.mockClear()

    const { cancelarTrocaAgendada } = await import("@/actions/billing")
    await semORedirectDeSucesso(() => cancelarTrocaAgendada())

    const { sub: s } = await leia(tenant.id, sub.id)
    expect(s!.pendingPlanId).toBeNull()
    expect(s!.planId).toBe(pro.id)
    expect(mockAtualizarAsaas).toHaveBeenCalledWith(sub.asaasId, {
      value: 197,
      updatePendingPayments: true,
    })
  })
})

describe("quando NÃO dá para trocar", () => {
  it.each(["PAST_DUE", "PENDING"] as const)("assinatura em %s: nada muda", async (status) => {
    const { tenant, sub, pro } = await cenario({ status })

    await expect(trocar(pro.id)).rejects.toThrow("trocaAssinaturaNaoAtiva")

    const { tenant: t, sub: s } = await leia(tenant.id, sub.id)
    expect(s!.planId).not.toBe(pro.id)
    expect(t!.planId).not.toBe(pro.id)
    expect(mockAtualizarAsaas).not.toHaveBeenCalled()
  })

  it("para o mesmo plano: recusa", async () => {
    const { starter } = await cenario()
    await expect(trocar(starter.id)).rejects.toThrow("trocaMesmoPlano")
  })

  it("a Asaas recusando: NADA muda no banco — os dois lados seguem coerentes", async () => {
    const { tenant, sub, pro } = await cenario()
    mockAtualizarAsaas.mockRejectedValue(new Error("Asaas fora do ar"))

    await expect(trocar(pro.id)).rejects.toThrow("trocaFalhou")

    const { tenant: t, sub: s } = await leia(tenant.id, sub.id)
    expect(s!.planId).not.toBe(pro.id)
    expect(t!.planId).not.toBe(pro.id)
  })
})

describe("o agendamento sendo aplicado", () => {
  const aplicar = async (sub: {
    id: string
    tenantId: string
    pendingPlanId: string | null
    currentPeriodEnd: Date
  }, agora: Date) => {
    const { aplicarTrocaAgendada } = await import("@/lib/troca-de-plano-db")
    return aplicarTrocaAgendada(sub, agora)
  }

  it("no fim do período, o plano cai de verdade — na assinatura e na empresa", async () => {
    const { tenant, sub, starter, pro } = await cenario()
    await trocar(pro.id)
    await trocar(starter.id)

    const antes = await testDb.db.subscription.findUnique({ where: { id: sub.id } })
    const aplicou = await aplicar(antes!, new Date("2026-10-02T12:00:00Z"))

    expect(aplicou).toBe(true)
    const { tenant: t, sub: s } = await leia(tenant.id, sub.id)
    expect(s!.planId).toBe(starter.id)
    expect(s!.pendingPlanId).toBeNull()
    expect(t!.planId).toBe(starter.id)
  })

  it("ANTES do fim, não aplica — o cliente pagou por aquele período", async () => {
    const { tenant, sub, starter, pro } = await cenario()
    await trocar(pro.id)
    await trocar(starter.id)

    const antes = await testDb.db.subscription.findUnique({ where: { id: sub.id } })
    const aplicou = await aplicar(antes!, new Date("2026-09-20T12:00:00Z"))

    expect(aplicou).toBe(false)
    const { tenant: t } = await leia(tenant.id, sub.id)
    expect(t!.planId).toBe(pro.id)
  })

  it("aplicar duas vezes não mexe na empresa de novo", async () => {
    const { sub, starter, pro } = await cenario()
    await trocar(pro.id)
    await trocar(starter.id)
    const antes = await testDb.db.subscription.findUnique({ where: { id: sub.id } })

    expect(await aplicar(antes!, new Date("2026-10-02T12:00:00Z"))).toBe(true)
    // A segunda vê o agendamento já consumido.
    expect(await aplicar(antes!, new Date("2026-10-02T12:00:00Z"))).toBe(false)
  })
})
