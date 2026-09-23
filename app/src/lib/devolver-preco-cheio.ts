import { asaas } from "@/lib/asaas"
import { precoCobrado } from "@/lib/preco"
import { prisma } from "@/lib/prisma"

// Devolver o preço cheio depois do primeiro pagamento.
//
// ─── Por que isto existe separado ────────────────────────────────────────────
//
// O desconto de indicação é de UM PAGAMENTO SÓ — é o que o banner, os Termos, o
// contrato e a tela de cobrança prometem. A assinatura da Asaas, porém, cobra o
// mesmo `value` em todo ciclo: criar a assinatura já descontada e não fazer
// mais nada transforma a promessa num desconto vitalício.
//
// A devolução existia desde 22/09/2026, dentro de `confirmarPagamento`, e era
// melhor esforço CEGO. Três coisas se somavam:
//
//   1. o único registro do desconto era `Tenant.referralDiscountPercent`, que
//      `actions/billing.ts` zera assim que a assinatura nasce na Asaas;
//   2. a falha caía num `catch` que só escrevia no console;
//   3. e ela nunca mais rodava — o gatilho é `status === "PENDING"`, e a
//      assinatura já tinha virado ACTIVE na mesma passagem.
//
// Ou seja: um timeout da Asaas (que o cliente tem, em asaas.ts) devolvia o
// desconto vitalício em silêncio, para sempre, e nada no sistema sabia. O modo
// de falha era pior que o defeito original, porque era invisível.
//
// Agrava que o verbo `POST /subscriptions/{id}` NUNCA foi exercitado contra a
// Asaas de verdade — o próprio comentário em lib/asaas.ts registra isso. Se ele
// estiver errado, 100% das devoluções falham. Com a tarefa registrada, esse
// cenário vira um alarme no dia seguinte em vez de um vazamento silencioso de
// receita.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

/** O que a assinatura precisa ter para se saber quanto devolver. */
export type AssinaturaParaDevolver = {
  id: string
  asaasId: string | null
  billingCycle: string
  referralDiscountPercent: number
  fullPriceRestoredAt: Date | null
  plan: { priceMonthly: unknown; priceYearly: unknown }
  tenant: { customPriceMonthly: unknown }
}

export type ResultadoDaDevolucao =
  | "devolvido"
  | "semDesconto"
  | "jaDevolvido"
  | "semAsaas"
  | "falhou"

/**
 * Põe a assinatura de volta no preço cheio, uma vez só.
 *
 * `updatePendingPayments` fica no padrão do cliente (false) DE PROPÓSITO: a
 * primeira fatura já foi emitida com desconto e é ela que honra a promessa.
 * Passar true aqui cobraria o valor cheio de quem acabou de ganhar o desconto.
 *
 * Idempotente por `fullPriceRestoredAt`: a marca é gravada depois do sucesso,
 * e quem já tem marca sai por `jaDevolvido`. Chamar duas vezes não cobra duas.
 */
export async function devolverPrecoCheio(
  sub: AssinaturaParaDevolver,
  agora: () => Date = () => new Date()
): Promise<ResultadoDaDevolucao> {
  if (sub.referralDiscountPercent <= 0) return "semDesconto"
  if (sub.fullPriceRestoredAt) return "jaDevolvido"
  if (!sub.asaasId) return "semAsaas"

  const cheio = precoCobrado(
    { priceMonthly: Number(sub.plan.priceMonthly), priceYearly: Number(sub.plan.priceYearly) },
    sub.tenant.customPriceMonthly === null ? null : Number(sub.tenant.customPriceMonthly),
    sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
    0
  )

  try {
    await asaas.updateSubscription(sub.asaasId, { value: cheio })
  } catch (e) {
    // NÃO engole: sem marca, a tarefa continua pendente e o cron tenta de novo
    // amanhã. Falhar aqui nunca pode derrubar a ativação de quem pagou — é por
    // isso que quem chama trata o "falhou" como aviso, e não como erro.
    console.error(
      "[desconto] falha ao devolver o preço cheio da assinatura:",
      sub.asaasId,
      e
    )
    return "falhou"
  }

  // A marca só depois do sucesso, e condicionada a ainda não existir: duas
  // passagens concorrentes (webhook e cron no mesmo instante) não disputam.
  await prisma.subscription.updateMany({
    where: { id: sub.id, fullPriceRestoredAt: null },
    data: { fullPriceRestoredAt: agora() },
  })
  return "devolvido"
}

/** O `select` que `devolverPrecoCheio` precisa. Um só, para as duas portas. */
export const CAMPOS_DA_DEVOLUCAO = {
  id: true,
  asaasId: true,
  billingCycle: true,
  referralDiscountPercent: true,
  fullPriceRestoredAt: true,
  plan: { select: { priceMonthly: true, priceYearly: true } },
  tenant: { select: { customPriceMonthly: true } },
} as const

/**
 * As devoluções que ficaram para trás.
 *
 * Nasceram com desconto, o primeiro pagamento já entrou (a assinatura não é
 * mais PENDING) e a Asaas nunca confirmou a volta ao preço cheio. Cada uma
 * destas é receita saindo todo ciclo.
 */
export function devolucoesPendentes(limite = 50) {
  return prisma.subscription.findMany({
    where: {
      referralDiscountPercent: { gt: 0 },
      fullPriceRestoredAt: null,
      asaasId: { not: null },
      status: { in: ["ACTIVE", "PAST_DUE"] },
    },
    select: CAMPOS_DA_DEVOLUCAO,
    orderBy: { currentPeriodStart: "asc" },
    take: limite,
  })
}
