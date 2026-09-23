import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O desconto de indicação é de UM PAGAMENTO SÓ — e o sistema passa a saber disso.
//
// ─── O defeito, em duas camadas ──────────────────────────────────────────────
//
// A promessa escrita é de uma vez só, em QUATRO lugares: o banner do cadastro,
// os Termos (seção 7), o contrato e a tela de cobrança. A assinatura da Asaas,
// porém, cobra o mesmo `value` em todo ciclo: criar a assinatura já descontada
// e não fazer mais nada é um desconto vitalício.
//
// A devolução do preço cheio foi construída em 22/09/2026 e resolveu o caso
// feliz. O que sobrou foi pior, porque era invisível:
//
//   1. o ÚNICO registro do desconto era `Tenant.referralDiscountPercent`, que
//      `actions/billing.ts` zera assim que a assinatura nasce na Asaas;
//   2. a falha da chamada caía num `catch` que só escrevia no console;
//   3. e ela nunca mais rodava — o gatilho é `status === "PENDING"`, e a
//      assinatura já tinha virado ACTIVE na mesma passagem.
//
// Somando: um timeout da Asaas devolvia desconto VITALÍCIO em silêncio, para
// sempre, sem nada no sistema saber que havia devolução pendente. Agrava que o
// verbo `POST /subscriptions/{id}` nunca foi exercitado contra a Asaas de
// verdade (o próprio lib/asaas.ts registra isso) — se estiver errado, 100% das
// devoluções falham.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

let testDb: TestDatabase
const mockAtualizarAsaas = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/asaas", () => ({
    asaas: { updateSubscription: mockAtualizarAsaas },
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockAtualizarAsaas.mockReset().mockResolvedValue(undefined)
})

const AGORA = new Date("2026-09-23T12:00:00Z")

async function assinatura(opcoes: {
  desconto: number
  devolvidoEm?: Date | null
  asaasId?: string | null
  status?: "ACTIVE" | "PAST_DUE" | "PENDING" | "CANCELLED"
  ciclo?: "MONTHLY" | "YEARLY"
}) {
  const marca = Math.random().toString(36).slice(2, 8)
  const plano = await testDb.db.plan.create({
    data: { name: "Pro", slug: `pro-${marca}`, priceMonthly: 197, priceYearly: 1970 },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", planId: plano.id, subscriptionStatus: "ACTIVE" },
  })
  return testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plano.id,
      asaasId: opcoes.asaasId === undefined ? `sub_${tenant.id}` : opcoes.asaasId,
      status: opcoes.status ?? "ACTIVE",
      billingCycle: opcoes.ciclo ?? "MONTHLY",
      currentPeriodStart: new Date("2026-09-01T12:00:00Z"),
      currentPeriodEnd: new Date("2026-10-01T12:00:00Z"),
      referralDiscountPercent: opcoes.desconto,
      fullPriceRestoredAt: opcoes.devolvidoEm ?? null,
    },
    include: {
      plan: { select: { priceMonthly: true, priceYearly: true } },
      tenant: { select: { customPriceMonthly: true } },
    },
  })
}

const devolver = async (sub: Parameters<typeof import("@/lib/devolver-preco-cheio")["devolverPrecoCheio"]>[0]) => {
  const { devolverPrecoCheio } = await import("@/lib/devolver-preco-cheio")
  return devolverPrecoCheio(sub, () => AGORA)
}

const releu = (id: string) => testDb.db.subscription.findUnique({ where: { id } })

describe("a devolução do preço cheio", () => {
  it("põe a assinatura no valor cheio e marca a data", async () => {
    const sub = await assinatura({ desconto: 10 })

    expect(await devolver(sub)).toBe("devolvido")

    expect(mockAtualizarAsaas).toHaveBeenCalledWith(sub.asaasId, { value: 197 })
    expect((await releu(sub.id))!.fullPriceRestoredAt).toEqual(AGORA)
  })

  it("NÃO reescreve a fatura já emitida — é ela que honra o desconto", async () => {
    // `updatePendingPayments` fica no padrão do cliente (false). Passar true
    // aqui cobraria o valor cheio de quem acabou de ganhar o desconto — o
    // defeito ao contrário.
    const sub = await assinatura({ desconto: 10 })

    await devolver(sub)

    const [, corpo] = mockAtualizarAsaas.mock.calls[0]
    expect(corpo.updatePendingPayments).toBeUndefined()
  })

  it("no plano ANUAL devolve o valor do ano, e não o do mês", async () => {
    const sub = await assinatura({ desconto: 10, ciclo: "YEARLY" })

    await devolver(sub)

    expect(mockAtualizarAsaas).toHaveBeenCalledWith(sub.asaasId, { value: 1970 })
  })

  it("quem não teve desconto NÃO provoca chamada à Asaas", async () => {
    // Era chamada para todo cliente novo, tendo ganho desconto ou não: um POST
    // a mais por assinatura, e uma chance a mais de falhar, por nada.
    const sub = await assinatura({ desconto: 0 })

    expect(await devolver(sub)).toBe("semDesconto")
    expect(mockAtualizarAsaas).not.toHaveBeenCalled()
  })

  it("e quem já foi devolvido não é devolvido de novo", async () => {
    const sub = await assinatura({ desconto: 10, devolvidoEm: new Date("2026-09-20T12:00:00Z") })

    expect(await devolver(sub)).toBe("jaDevolvido")
    expect(mockAtualizarAsaas).not.toHaveBeenCalled()
  })
})

describe("quando a Asaas recusa", () => {
  it("NÃO marca como devolvido — a tarefa continua pendente", async () => {
    // É o coração da correção. Antes, a falha era engolida num console.error e
    // a devolução nunca mais rodava: desconto vitalício em silêncio.
    const sub = await assinatura({ desconto: 10 })
    mockAtualizarAsaas.mockRejectedValue(new Error("Asaas fora do ar"))

    expect(await devolver(sub)).toBe("falhou")

    expect((await releu(sub.id))!.fullPriceRestoredAt).toBeNull()
  })

  it("e a varredura do cron a encontra no dia seguinte", async () => {
    const sub = await assinatura({ desconto: 10 })
    mockAtualizarAsaas.mockRejectedValue(new Error("Asaas fora do ar"))
    await devolver(sub)

    const { devolucoesPendentes } = await import("@/lib/devolver-preco-cheio")
    const pendentes = await devolucoesPendentes()

    expect(pendentes.map((p) => p.id)).toEqual([sub.id])
  })

  it("e na tentativa seguinte ela conclui", async () => {
    const sub = await assinatura({ desconto: 10 })
    mockAtualizarAsaas.mockRejectedValueOnce(new Error("Asaas fora do ar"))
    await devolver(sub)
    mockAtualizarAsaas.mockResolvedValue(undefined)

    const { devolucoesPendentes } = await import("@/lib/devolver-preco-cheio")
    const [pendente] = await devolucoesPendentes()
    expect(await devolver(pendente)).toBe("devolvido")

    expect((await releu(sub.id))!.fullPriceRestoredAt).toEqual(AGORA)
  })
})

describe("a fila de devoluções pendentes", () => {
  it("não traz quem já foi devolvido, nem quem nunca teve desconto", async () => {
    await assinatura({ desconto: 10, devolvidoEm: AGORA })
    await assinatura({ desconto: 0 })
    const devendo = await assinatura({ desconto: 10 })

    const { devolucoesPendentes } = await import("@/lib/devolver-preco-cheio")

    expect((await devolucoesPendentes()).map((p) => p.id)).toEqual([devendo.id])
  })

  it("nem assinatura cancelada, que não cobra mais nada", async () => {
    await assinatura({ desconto: 10, status: "CANCELLED" })

    const { devolucoesPendentes } = await import("@/lib/devolver-preco-cheio")

    expect(await devolucoesPendentes()).toHaveLength(0)
  })

  it("mas traz a que está EM ATRASO — ela volta a cobrar quando o cliente pagar", async () => {
    const atrasada = await assinatura({ desconto: 10, status: "PAST_DUE" })

    const { devolucoesPendentes } = await import("@/lib/devolver-preco-cheio")

    expect((await devolucoesPendentes()).map((p) => p.id)).toEqual([atrasada.id])
  })
})

describe("o que está escrito e o que o código faz", () => {
  // A regra de ouro: as duas fontes, lidas juntas. A promessa aparece em quatro
  // lugares e o código é um só.
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  const mensagens = (idioma: "pt" | "en") =>
    JSON.parse(ler(`messages/${idioma}.json`)) as Record<string, never>

  it.each(["pt", "en"] as const)("a tela de cobrança diz PRIMEIRO PAGAMENTO — %s", (idioma) => {
    // Ela mostrava o preço descontado como O preço do plano, com o cheio
    // riscado ao lado e o rótulo "{percent}% de desconto de indicação
    // aplicado". Em nenhum dos dois idiomas dizia que era de uma vez só: lê-se
    // como corte permanente de mensalidade. É a quarta promessa, e a que o
    // comprador tem na frente na hora de decidir.
    const m = mensagens(idioma) as unknown as {
      billingReferral: { billing: { plans: { referralDiscount: string } } }
    }
    const rotulo = m.billingReferral.billing.plans.referralDiscount
    expect(rotulo).toMatch(idioma === "pt" ? /primeiro pagamento/i : /first payment/i)
  })

  it("a assinatura NASCE sabendo o desconto que carrega", () => {
    // Sem isto não há retentativa possível: `Tenant.referralDiscountPercent` é
    // zerado na mesma Action, logo depois.
    expect(ler("src/actions/billing.ts")).toContain("referralDiscountPercent: discountPercent")
  })

  it("e a confirmação do pagamento delega a devolução, em vez de tentar sozinha", () => {
    const fonte = ler("src/lib/confirmar-pagamento.ts")
    expect(fonte).toContain("devolverPrecoCheio(sub)")
    // O catch mudo que engolia a falha não volta.
    expect(fonte).not.toMatch(/catch[\s\S]{0,120}Falha ao devolver o preço cheio/)
  })

  it("o cron varre as que encalharam e AVISA", () => {
    const cron = ler("src/app/api/cron/daily/route.ts")
    expect(cron).toContain("devolucoesPendentes()")
    expect(cron).toContain("descontosEncalhados")
    // Pendência, e não erro do cron: contar como erro derrubaria /api/health e
    // mandaria o e-mail vermelho diário com o sistema de pé — o remédio que já
    // custou 146 horas de alarme falso em 09/2026.
    expect(cron).toMatch(/descontosEncalhados > 0[\s\S]{0,400}avisarPendenciaUmaVez/)
  })
})
