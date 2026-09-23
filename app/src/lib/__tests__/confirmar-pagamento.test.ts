import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// NADA de importar @/lib/confirmar-pagamento no topo: doMock não é içado, e um
// import estático carregaria o módulo com o Prisma REAL antes dos mocks — os
// testes rodariam contra o banco de verdade. Só `await import()` depois.

// Um pagamento confirmado é UM fato, com UMA regra — e agora com UMA escrita.
//
// ─── Dois defeitos da auditoria de 13/09/2026 ────────────────────────────────
//
// 1. O webhook reivindicava o pagamento (lastProcessedPaymentId) num update e
//    só depois, em outra transação, ativava. Se a segunda falhasse, o pagamento
//    ficava marcado como processado sem ter comprado nada — e o cron, que
//    confia nessa marca, o descartava para sempre: a empresa pagou, seguia
//    PAST_DUE, recebia a régua inteira e era cortada no dia 30.
// 2. O cron reimplementava só a troca de status. Quem era reativado por ele
//    não recebia contrato, quem o indicou não ganhava o bônus, e o desconto de
//    indicação ficava vitalício na Asaas.
//
// Os dois chamam lib/confirmar-pagamento.ts agora. Isto testa a regra dela.

let testDb: TestDatabase
const mockNotificar = vi.fn()
const mockUpdateSub = vi.fn()
const mockContrato = vi.fn()
const mockEmail = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/notificar", () => ({ notificar: mockNotificar }))
  vi.doMock("@/lib/asaas", () => ({ asaas: { updateSubscription: mockUpdateSub } }))
  vi.doMock("@/lib/contrato", () => ({ gerarContrato: mockContrato }))
  vi.doMock("@/lib/resend", () => ({ sendPaymentConfirmedEmail: mockEmail }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockNotificar.mockReset().mockResolvedValue(undefined)
  mockUpdateSub.mockReset().mockResolvedValue(undefined)
  mockContrato.mockReset().mockResolvedValue(null)
  mockEmail.mockReset().mockResolvedValue(undefined)
})

const FIM = new Date("2026-10-15T12:00:00Z")

async function cenario(opcoes: {
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"
  ciclo?: "MONTHLY" | "YEARLY"
  ultimoPagamento?: string | null
  indicadoPor?: string | null
  tenantStatus?: "TRIAL" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"
  /** O desconto de indicacao com que a assinatura nasceu. */
  desconto?: number
}) {
  const plano = await testDb.db.plan.create({
    data: { name: "Pro", slug: `pro-${Math.random().toString(36).slice(2, 8)}`, priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      subscriptionStatus: opcoes.tenantStatus ?? (opcoes.status === "PENDING" ? "PENDING" : opcoes.status),
      referredByCode: opcoes.indicadoPor ?? null,
    },
  })
  await testDb.db.user.create({
    data: { id: `dono-${tenant.id}`, tenantId: tenant.id, name: "Adriel", email: `d-${tenant.id}@ex.com`, role: "OWNER" },
  })
  const sub = await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plano.id,
      asaasId: `sub_${tenant.id}`,
      status: opcoes.status,
      billingCycle: opcoes.ciclo ?? "MONTHLY",
      currentPeriodStart: new Date("2026-09-15T12:00:00Z"),
      currentPeriodEnd: FIM,
      lastProcessedPaymentId: opcoes.ultimoPagamento ?? null,
      pastDueWarningsSent: 2,
      referralDiscountPercent: opcoes.desconto ?? 0,
    },
  })
  return { plano, tenant, sub }
}

const confirmar = async (subscriptionId: string, paymentId: string) => {
  const { confirmarPagamento } = await import("@/lib/confirmar-pagamento")
  const r = await confirmarPagamento({ subscriptionId, paymentId })
  await r.pendente
  return r
}

const depois = (subId: string, tenantId: string) =>
  Promise.all([
    testDb.db.subscription.findUnique({ where: { id: subId } }),
    testDb.db.tenant.findUnique({ where: { id: tenantId } }),
  ])

describe("a regra pura do fim do período", () => {
  it("primeira confirmação NÃO estende — subscribeToPlan já gravou criação + 1 ciclo", async () => {
    const { fimDoPeriodoAposPagamento } = await import("@/lib/confirmar-pagamento")
    expect(fimDoPeriodoAposPagamento("PENDING", FIM, "MONTHLY")).toEqual(FIM)
  })
  it("renovação mensal estende 1 mês, anual estende 12", async () => {
    const { fimDoPeriodoAposPagamento } = await import("@/lib/confirmar-pagamento")
    expect(fimDoPeriodoAposPagamento("ACTIVE", FIM, "MONTHLY")).toEqual(new Date("2026-11-15T12:00:00Z"))
    expect(fimDoPeriodoAposPagamento("PAST_DUE", FIM, "YEARLY")).toEqual(new Date("2027-10-15T12:00:00Z"))
  })
})

describe("a primeira confirmação", () => {
  it("ativa assinatura e empresa numa escrita só, e grava o plano", async () => {
    const { sub, tenant, plano } = await cenario({ status: "PENDING", tenantStatus: "TRIAL" })

    const r = await confirmar(sub.id, "pay_1")

    expect(r.resultado).toBe("ativada")
    const [s, t] = await depois(sub.id, tenant.id)
    expect(s!.status).toBe("ACTIVE")
    expect(s!.lastProcessedPaymentId).toBe("pay_1")
    expect(s!.currentPeriodEnd).toEqual(FIM) // não estende
    expect(s!.pastDueWarningsSent).toBe(0)
    expect(t!.subscriptionStatus).toBe("ACTIVE")
    expect(t!.planId).toBe(plano.id)
  })

  it("devolve o preço cheio à Asaas — o desconto de indicação é de um pagamento só", async () => {
    // A assinatura NASCE com o desconto gravado nela. Antes, este teste criava
    // uma assinatura SEM desconto e afirmava que a Asaas era chamada assim
    // mesmo — fixando como funcionalidade um POST inútil por cliente novo, e
    // provando a devolução justamente no caso em que não há o que devolver.
    const { sub } = await cenario({ status: "PENDING", desconto: 10 })
    await confirmar(sub.id, "pay_1")
    expect(mockUpdateSub).toHaveBeenCalledWith(sub.asaasId, { value: 197 })
  })

  it("e não chama a Asaas quando não houve desconto nenhum", async () => {
    const { sub } = await cenario({ status: "PENDING" })
    await confirmar(sub.id, "pay_1")
    expect(mockUpdateSub).not.toHaveBeenCalled()
  })

  it("credita 20% a quem indicou, com teto em 100", async () => {
    const indicador = await testDb.db.tenant.create({
      data: { name: "Quem Indicou", referralCode: "IND123", referralDiscountPercent: 90 },
    })
    const { sub } = await cenario({ status: "PENDING", indicadoPor: "IND123" })

    await confirmar(sub.id, "pay_1")

    const d = await testDb.db.tenant.findUnique({ where: { id: indicador.id } })
    expect(d!.referralDiscountPercent).toBe(100)
  })

  it("manda o e-mail de confirmação com o contrato", async () => {
    const { sub } = await cenario({ status: "PENDING" })
    mockContrato.mockResolvedValue({ nomeArquivo: "contrato.pdf", buffer: Buffer.from("x") })

    await confirmar(sub.id, "pay_1")

    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect(mockEmail.mock.calls[0][4]).toMatchObject({ nomeArquivo: "contrato.pdf" })
    expect(mockNotificar).toHaveBeenCalledTimes(1)
  })
})

describe("o mesmo pagamento duas vezes (CONFIRMED e depois RECEIVED)", () => {
  it("a segunda é REPETIDA: nada soma, nada reenvia", async () => {
    const { sub, tenant } = await cenario({ status: "PENDING", desconto: 10 })
    await confirmar(sub.id, "pay_1")
    const r = await confirmar(sub.id, "pay_1")

    expect(r.resultado).toBe("repetida")
    const [s] = await depois(sub.id, tenant.id)
    expect(s!.currentPeriodEnd).toEqual(FIM)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect(mockUpdateSub).toHaveBeenCalledTimes(1)
  })
})

describe("a renovação de quem estava em atraso", () => {
  it("estende um ciclo e zera os avisos de atraso", async () => {
    const { sub } = await cenario({ status: "PAST_DUE", ultimoPagamento: "pay_1" })

    const r = await confirmar(sub.id, "pay_2")

    expect(r.resultado).toBe("ativada")
    const s = await testDb.db.subscription.findUnique({ where: { id: sub.id } })
    expect(s!.currentPeriodEnd).toEqual(new Date("2026-11-15T12:00:00Z"))
    expect(s!.pastDueWarningsSent).toBe(0)
    // Renovação não é primeira compra: sem preço cheio, sem bônus.
    expect(mockUpdateSub).not.toHaveBeenCalled()
  })

  it("o pagamento que já foi processado NÃO ativa a empresa de novo — a transação é uma", async () => {
    // Com o array de $transaction, o update do tenant rodava mesmo quando a
    // reivindicação devolvia zero linhas: Tenant ACTIVE com Subscription PAST_DUE.
    const { sub, tenant } = await cenario({ status: "PAST_DUE", ultimoPagamento: "pay_1" })

    const r = await confirmar(sub.id, "pay_1")

    expect(r.resultado).toBe("repetida")
    const [s, t] = await depois(sub.id, tenant.id)
    expect(s!.status).toBe("PAST_DUE")
    expect(t!.subscriptionStatus).toBe("PAST_DUE")
  })
})

describe("o estado que o defeito deixava", () => {
  it("PENDING com a marca gravada e a ativação perdida SARA: o pagamento ainda ativa", async () => {
    // Era o cenário exato: claim gravada, transação de ativação falhou, catch
    // vazio. No dia seguinte o cron descartava pay_1 por já estar marcado — e a
    // empresa que pagou ficava presa para sempre.
    const { sub, tenant } = await cenario({ status: "PENDING", ultimoPagamento: "pay_1", tenantStatus: "PENDING" })

    const r = await confirmar(sub.id, "pay_1")

    expect(r.resultado).toBe("ativada")
    const [s, t] = await depois(sub.id, tenant.id)
    expect(s!.status).toBe("ACTIVE")
    expect(t!.subscriptionStatus).toBe("ACTIVE")
  })
})

describe("o que não ressuscita", () => {
  it("assinatura CANCELADA não volta por pagamento atrasado ou reenviado", async () => {
    const { sub, tenant } = await cenario({ status: "CANCELLED" })

    const r = await confirmar(sub.id, "pay_9")

    expect(r.resultado).toBe("cancelada")
    const [s, t] = await depois(sub.id, tenant.id)
    expect(s!.status).toBe("CANCELLED")
    expect(t!.subscriptionStatus).toBe("CANCELLED")
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it("assinatura que não existe", async () => {
    const r = await confirmar("nao-existe", "pay_1")
    expect(r.resultado).toBe("inexistente")
  })
})

describe("falha no e-mail não desfaz a ativação", () => {
  it("o contrato falha, o e-mail falha — a empresa continua ativa e `pendente` não rejeita", async () => {
    const { sub, tenant } = await cenario({ status: "PENDING" })
    mockContrato.mockRejectedValue(new Error("PDF quebrou"))
    mockEmail.mockRejectedValue(new Error("Resend: recusado"))

    const r = await confirmar(sub.id, "pay_1")

    expect(r.resultado).toBe("ativada")
    const [, t] = await depois(sub.id, tenant.id)
    expect(t!.subscriptionStatus).toBe("ACTIVE")
  })
})
