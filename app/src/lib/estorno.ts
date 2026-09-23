/**
 * Estorno e chargeback: o dinheiro voltou para o cliente. E o acesso?
 *
 * Até 15/09/2026 o webhook da Asaas tratava PAYMENT_RECEIVED/CONFIRMED (ativa),
 * PAYMENT_OVERDUE (atraso) e SUBSCRIPTION_DELETED (cancela). Estorno e
 * chargeback não eram nem lidos: o cliente contestava no cartão, a Asaas
 * devolvia, e a empresa continuava com acesso total até o fim do período —
 * pago com dinheiro que já não era nosso. (Achado na auditoria de 13/09/2026.)
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────
 *
 * Só o pagamento que COMPROU o período corrente revoga o acesso. É o que
 * `lastProcessedPaymentId` guarda. Estorno de outro pagamento — um ciclo
 * antigo, ou uma assinatura ativada à mão antes de existir a marca — só AVISA
 * o dono da plataforma: o período corrente está pago por outro dinheiro, e ele
 * decide no painel.
 *
 * Revogar é: Subscription CANCELLED com `currentPeriodEnd = agora`. Só
 * CANCELLED não bastaria — desde 14/09/2026 o cancelamento honra o período
 * pago (lib/auth.ts), e aqui o período NÃO foi pago. Dinheiro devolvido é
 * período não pago; os Termos dizem que valor pago não é reembolsável, então
 * quem recebe de volta não tem o que honrar.
 *
 * Módulo puro: as decisões aqui, o banco e a Asaas no webhook.
 */

/** Eventos da Asaas em que o dinheiro de um pagamento JÁ LIQUIDADO volta ao cliente. */
export const EVENTOS_DE_ESTORNO: ReadonlySet<string> = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
])
// Fora de propósito: PAYMENT_CHARGEBACK_DISPUTE e
// PAYMENT_AWAITING_CHARGEBACK_REVERSAL vêm DEPOIS do REQUESTED sobre o MESMO
// pagamento (não são fato novo); PAYMENT_REFUND_IN_PROGRESS ainda não devolveu
// nada (o REFUNDED vem depois); PAYMENT_PARTIALLY_REFUNDED é cortesia e não
// desfaz o período; PAYMENT_DELETED só existe para cobrança ainda não paga.

export function ehEstorno(event: unknown): boolean {
  return typeof event === "string" && EVENTOS_DE_ESTORNO.has(event)
}

export function ehContestacao(event: unknown): boolean {
  return event === "PAYMENT_CHARGEBACK_REQUESTED"
}

export type DecisaoDeEstorno = "revogar" | "avisar" | "ignorar"

export function decidirEstorno(
  sub: { lastProcessedPaymentId: string | null },
  pagamentoId: string | null | undefined
): DecisaoDeEstorno {
  if (!pagamentoId) return "ignorar"
  return sub.lastProcessedPaymentId === pagamentoId ? "revogar" : "avisar"
}

/**
 * De onde vem o id da assinatura num evento da Asaas.
 *
 * Eventos de PAGAMENTO trazem `payment.subscription`. Eventos de ASSINATURA
 * (SUBSCRIPTION_DELETED, SUBSCRIPTION_UPDATED...) trazem `subscription.id` —
 * e não têm `payment`. O webhook lia só o primeiro, e desistia antes de chegar
 * ao ramo de SUBSCRIPTION_DELETED: o cancelamento feito pela Asaas nunca era
 * processado aqui. (Achado na auditoria de 13/09/2026.)
 */
export function idDaAssinaturaNoEvento(body: {
  payment?: { subscription?: unknown } | null
  subscription?: { id?: unknown } | null
}): string | null {
  const doPagamento = body.payment?.subscription
  if (typeof doPagamento === "string" && doPagamento) return doPagamento
  const daAssinatura = body.subscription?.id
  if (typeof daAssinatura === "string" && daAssinatura) return daAssinatura
  return null
}
