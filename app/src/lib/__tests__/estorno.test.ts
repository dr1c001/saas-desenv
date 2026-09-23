import { describe, expect, it } from "vitest"
import { decidirEstorno, ehContestacao, ehEstorno, idDaAssinaturaNoEvento } from "@/lib/estorno"

// O webhook da Asaas e os fatos que ele não lia.
//
// ─── Estorno e chargeback ────────────────────────────────────────────────────
//
// O cliente contestava no cartão, a Asaas devolvia o dinheiro, e a empresa
// continuava com acesso total até o fim do período — pago com dinheiro que já
// não era nosso. O webhook não tratava PAYMENT_REFUNDED nem
// PAYMENT_CHARGEBACK_REQUESTED.
//
// ─── SUBSCRIPTION_DELETED inalcançável ───────────────────────────────────────
//
// O handler lia o id da assinatura só de `payment.subscription`. Evento de
// ASSINATURA não tem `payment`: o handler desistia na segunda linha e o ramo
// de cancelamento, quarenta linhas abaixo, nunca rodava.
//
// (Achados na auditoria de 13/09/2026.)

describe("que evento é estorno", () => {
  it("REFUNDED e CHARGEBACK_REQUESTED: o dinheiro liquidado voltou", () => {
    expect(ehEstorno("PAYMENT_REFUNDED")).toBe(true)
    expect(ehEstorno("PAYMENT_CHARGEBACK_REQUESTED")).toBe(true)
  })

  it("os que vêm DEPOIS sobre o mesmo pagamento, ou que ainda não devolveram nada, não", () => {
    for (const e of [
      "PAYMENT_CHARGEBACK_DISPUTE",
      "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
      "PAYMENT_REFUND_IN_PROGRESS",
      "PAYMENT_PARTIALLY_REFUNDED",
      "PAYMENT_DELETED",
      "PAYMENT_RECEIVED",
    ]) {
      expect(ehEstorno(e), e).toBe(false)
    }
    expect(ehEstorno(undefined)).toBe(false)
  })

  it("só o chargeback é contestação — muda o texto do aviso", () => {
    expect(ehContestacao("PAYMENT_CHARGEBACK_REQUESTED")).toBe(true)
    expect(ehContestacao("PAYMENT_REFUNDED")).toBe(false)
  })
})

describe("o que o estorno faz com o acesso", () => {
  it("do pagamento que comprou o período corrente: REVOGA", () => {
    expect(decidirEstorno({ lastProcessedPaymentId: "pay_7" }, "pay_7")).toBe("revogar")
  })

  it("de outro pagamento (ciclo antigo): só AVISA — o período atual está pago por outro dinheiro", () => {
    expect(decidirEstorno({ lastProcessedPaymentId: "pay_7" }, "pay_3")).toBe("avisar")
  })

  it("assinatura sem marca (ativada à mão, ou antes de 03/08/2026): só avisa", () => {
    expect(decidirEstorno({ lastProcessedPaymentId: null }, "pay_7")).toBe("avisar")
  })

  it("sem id de pagamento não há o que decidir", () => {
    expect(decidirEstorno({ lastProcessedPaymentId: "pay_7" }, undefined)).toBe("ignorar")
    expect(decidirEstorno({ lastProcessedPaymentId: "pay_7" }, "")).toBe("ignorar")
  })
})

describe("de onde vem o id da assinatura", () => {
  it("evento de pagamento: payment.subscription", () => {
    expect(idDaAssinaturaNoEvento({ payment: { subscription: "sub_1" } })).toBe("sub_1")
  })

  it("evento de assinatura (SUBSCRIPTION_DELETED): subscription.id — o que faltava", () => {
    expect(idDaAssinaturaNoEvento({ subscription: { id: "sub_2" } })).toBe("sub_2")
  })

  it("nada dos dois: null, e o webhook ignora", () => {
    expect(idDaAssinaturaNoEvento({})).toBeNull()
    expect(idDaAssinaturaNoEvento({ payment: { subscription: null } })).toBeNull()
    expect(idDaAssinaturaNoEvento({ subscription: { id: 42 } })).toBeNull()
  })
})

describe("o webhook, estruturalmente", () => {
  // O handler é uma rota HTTP com Prisma, Asaas e after() do Next — exercitar
  // de ponta a ponta exigiria simular tudo isso para provar linhas que a regra
  // pura acima já cobre. Aqui só o que é despacho.
  const ler = () => import("node:fs/promises").then((fs) => fs.readFile("src/app/api/webhooks/asaas/route.ts", "utf-8"))

  it("lê o id pelos dois caminhos, e não só por payment.subscription", async () => {
    const fonte = await ler()
    expect(fonte).toContain("idDaAssinaturaNoEvento(")
    expect(fonte).not.toMatch(/const asaasSubId[^\n]*=\s*payment\?\.subscription\s*$/m)
  })

  it("confirma pagamento pelo MESMO módulo que o cron", async () => {
    const webhook = await ler()
    const cron = await import("node:fs/promises").then((fs) => fs.readFile("src/app/api/cron/daily/route.ts", "utf-8"))
    expect(webhook).toContain("await confirmarPagamento({")
    expect(cron).toContain("await confirmarPagamento({")
    // E nenhum dos dois ativa por conta própria.
    expect(webhook).not.toMatch(/subscriptionStatus: "ACTIVE"/)
    expect(cron).not.toMatch(/subscriptionStatus: "ACTIVE"/)
  })

  it("o catch final REGISTRA — não engole em silêncio", async () => {
    const fonte = await ler()
    expect(fonte).not.toMatch(/catch \{\s*\/\/ never return 5xx/)
    expect(fonte).toMatch(/catch \(err\) \{[\s\S]*?console\.error\("\[webhook asaas\] falhou/)
  })

  it("trata estorno: revoga o período corrente e encerra a cobrança na Asaas", async () => {
    const fonte = await ler()
    expect(fonte).toContain("ehEstorno(event)")
    expect(fonte).toContain("currentPeriodEnd: agora")
    expect(fonte).toContain(".cancelSubscription(sub.asaasId)")
    expect(fonte).toContain('avisarPlataforma("pagamentoEstornado"')
  })

  it("no cancelamento vindo da Asaas o PLANO fica — mesma regra de actions/billing.ts", async () => {
    const fonte = await ler()
    expect(fonte).not.toContain("planId: null")
  })
})
