import { DESCONTO_DE_QUEM_INDICA, TETO_DE_DESCONTO } from "@/lib/indicacao"
import { prisma } from "@/lib/prisma"
import { notificar } from "@/lib/notificar"
import { devolverPrecoCheio } from "@/lib/devolver-preco-cheio"
import { gerarContrato } from "@/lib/contrato"
import { sendPaymentConfirmedEmail } from "@/lib/resend"
import { aplicarTrocaAgendada } from "@/lib/troca-de-plano-db"

/**
 * O que acontece quando um pagamento de assinatura é CONFIRMADO.
 *
 * ─── Por que existe ──────────────────────────────────────────────────────────
 *
 * Havia dois caminhos para o mesmo fato. O webhook da Asaas ativava a
 * assinatura E fazia mais quatro coisas: push ao escritório, devolução do
 * preço cheio depois do desconto de indicação, bônus a quem indicou, contrato
 * anexado ao e-mail de confirmação. A reconciliação diária do cron — a rede
 * de segurança para o webhook que se perde, o caso real de 07/08/2026 — fazia
 * só a primeira. O comentário dela dizia "exatamente o mesmo caminho do
 * webhook"; o código nunca teve isso. Quem era reativado pelo cron pagava e
 * não recebia contrato, quem o indicou não ganhava os 20%, e o desconto de
 * indicação ficava vitalício na Asaas. Agora os dois chamam ISTO.
 *
 * ─── Por que reivindicar e ativar são UMA escrita ────────────────────────────
 *
 * O webhook gravava `lastProcessedPaymentId` num `updateMany` e só DEPOIS, em
 * outra transação, punha Subscription e Tenant em ACTIVE. Se a segunda
 * falhasse (timeout, pool esgotado), o pagamento ficava marcado como
 * processado sem ter comprado nada — e o cron, que confia nessa marca,
 * descartava o pagamento para sempre: a empresa pagou, seguia PAST_DUE,
 * recebia a régua inteira por uma fatura quitada e era cortada no dia 30.
 * Aqui a reivindicação É a ativação, na mesma linha do mesmo UPDATE.
 *
 * Forma interativa de `$transaction`, e não o array: no array o update do
 * Tenant rodaria mesmo quando a reivindicação devolve zero linhas (reentrega
 * de pagamento já processado), pondo o Tenant em ACTIVE com a Subscription em
 * PAST_DUE. (Achados na auditoria de 13/09/2026.)
 *
 * ─── O que fica de fora da transação ─────────────────────────────────────────
 *
 * Tudo que fala com rede: push, Asaas, e-mail. Falhar em qualquer um deles não
 * pode desfazer a ativação de quem acabou de pagar. O e-mail com o contrato
 * volta em `pendente` para o chamador decidir: o webhook passa a `after()`
 * (precisa responder rápido à Asaas), o cron simplesmente aguarda.
 */

// Bônus de quem indicou, creditado só na PRIMEIRA confirmação de pagamento do
// indicado (não em renovações). Os números moram em lib/indicacao.ts; estes
// nomes continuam exportados porque os testes e o painel os usam.
//
// O comentário anterior mandava espelhar o valor em `api/referral/join/route.ts`,
// arquivo que não existe. (Achado na auditoria de 13/09/2026, grupo 9.)
export const REFERRER_DISCOUNT_PERCENT = DESCONTO_DE_QUEM_INDICA
export const MAX_DISCOUNT_PERCENT = TETO_DE_DESCONTO

type Status = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIAL"

/**
 * Regra pura: até quando vale o acesso depois deste pagamento.
 *
 * Na PRIMEIRA confirmação (assinatura PENDING) não estende: `subscribeToPlan`
 * já gravou criação + 1 ciclo, e somar de novo dava dois ciclos pelo preço de
 * um (achado de 21/07/2026). Renovação e recuperação de atraso estendem.
 */
export function fimDoPeriodoAposPagamento(
  status: Status | string,
  atual: Date,
  ciclo: "MONTHLY" | "YEARLY" | string
): Date {
  const fim = new Date(atual)
  if (status !== "PENDING") fim.setMonth(fim.getMonth() + (ciclo === "YEARLY" ? 12 : 1))
  return fim
}

export type ResultadoDaConfirmacao =
  | "ativada"
  /** O mesmo pagamento já tinha sido processado (CONFIRMED + RECEIVED do mesmo id, ou reenvio). */
  | "repetida"
  /** Assinatura cancelada localmente não ressuscita por pagamento atrasado (decisão de 19/07/2026). */
  | "cancelada"
  | "inexistente"

export async function confirmarPagamento(args: {
  subscriptionId: string
  paymentId: string
}): Promise<{ resultado: ResultadoDaConfirmacao; pendente: Promise<void> }> {
  const nada = Promise.resolve()
  const sub = await prisma.subscription.findUnique({
    where: { id: args.subscriptionId },
    include: {
      plan: { select: { name: true, priceMonthly: true, priceYearly: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          referredByCode: true,
          customPriceMonthly: true,
          locale: true,
          vocabulary: true,
          users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
        },
      },
    },
  })
  if (!sub) return { resultado: "inexistente", pendente: nada }
  if (sub.status === "CANCELLED") return { resultado: "cancelada", pendente: nada }

  const primeira = sub.status === "PENDING"
  const periodEnd = fimDoPeriodoAposPagamento(sub.status, sub.currentPeriodEnd, sub.billingCycle)

  const ativou = await prisma.$transaction(async (tx) => {
    const claim = await tx.subscription.updateMany({
      where: {
        id: sub.id,
        // A guarda de CANCELLED também no WHERE: a leitura lá em cima não é
        // atômica com esta escrita.
        status: { not: "CANCELLED" },
        // Uma PENDING nunca processou pagamento nenhum: se ficou uma marca de
        // reivindicação de uma ativação que falhou no meio (o estado que este
        // módulo veio eliminar), ela sara aqui. Seguro contra CONFIRMED →
        // RECEIVED do mesmo pagamento: depois da primeira, a sub já é ACTIVE.
        OR: [
          { lastProcessedPaymentId: null },
          { lastProcessedPaymentId: { not: args.paymentId } },
          { status: "PENDING" },
        ],
      },
      data: {
        status: "ACTIVE",
        lastProcessedPaymentId: args.paymentId,
        currentPeriodEnd: periodEnd,
        // Zera os avisos de atraso: se este cliente ficar inadimplente de novo
        // daqui a alguns meses, o ciclo de avisos recomeça do primeiro.
        pastDueWarningsSent: 0,
      },
    })
    if (claim.count === 0) return false
    // A primeira confirmação é o único lugar que efetivamente ativa o tenant:
    // subscribeToPlan cria a Subscription PENDING e não mexe no plano dele.
    await tx.tenant.update({
      where: { id: sub.tenantId },
      data: { subscriptionStatus: "ACTIVE", planId: sub.planId },
    })
    return true
  })
  if (!ativou) return { resultado: "repetida", pendente: nada }

  // O DOWNGRADE AGENDADO vale aqui: um ciclo novo comeca, e o periodo que o
  // cliente pagou no plano antigo acabou. `currentPeriodEnd` ja foi estendido
  // acima, entao a checagem usa o valor de ANTES — que e o fim do periodo que
  // de fato terminou. O cron e a rede de seguranca para quem nao renovou.
  await aplicarTrocaAgendada(
    { id: sub.id, tenantId: sub.tenantId, pendingPlanId: sub.pendingPlanId, currentPeriodEnd: sub.currentPeriodEnd },
    new Date()
  )

  // Avisa o escritório no celular. O e-mail de confirmação já vai, mas e-mail
  // de cobrança é o que mais cai em spam — e a informação aqui é boa: o acesso
  // voltou. `notificar` nunca lança.
  await notificar({
    tenantId: sub.tenantId,
    evento: "pagamentoConfirmado",
    corpo: sub.plan.name,
    url: "/billing",
    referencia: sub.id,
  })

  // O desconto de indicação acaba AQUI — ele é de um pagamento só.
  //
  // A regra e a retentativa moram em lib/devolver-preco-cheio.ts. Continua
  // sendo melhor esforço NESTE ponto: falhar aqui nunca pode derrubar a
  // ativação de quem acabou de pagar. A diferença é que agora a falha deixa
  // RASTRO — a assinatura guarda o desconto com que nasceu e fica sem
  // `fullPriceRestoredAt` —, então o cron diário tenta de novo amanhã e avisa
  // se a devolução encalhar. Antes, um timeout da Asaas devolvia desconto
  // vitalício em silêncio e nada no sistema sabia.
  // (Achado na auditoria de 13/09/2026, grupo 9.)
  if (primeira) {
    await devolverPrecoCheio(sub)
  }

  // Bônus de quem indicou — melhor esforço. `increment` é atômico no banco;
  // o teto vem num update condicionado, também seguro sob corrida.
  if (primeira && sub.tenant.referredByCode) {
    try {
      const referrer = await prisma.tenant.findUnique({
        where: { referralCode: sub.tenant.referredByCode },
        select: { id: true },
      })
      if (referrer) {
        await prisma.tenant.update({
          where: { id: referrer.id },
          data: { referralDiscountPercent: { increment: REFERRER_DISCOUNT_PERCENT } },
        })
        await prisma.tenant.updateMany({
          where: { id: referrer.id, referralDiscountPercent: { gt: MAX_DISCOUNT_PERCENT } },
          data: { referralDiscountPercent: MAX_DISCOUNT_PERCENT },
        })
      }
    } catch (err) {
      console.error("Falha ao creditar bônus de indicação:", err)
    }
  }

  // O contrato e o e-mail de confirmação. NUNCA rejeita: quem chama pode
  // passar a `after()` ou aguardar sem try/catch.
  const owner = sub.tenant.users[0]
  const pendente = owner?.email
    ? gerarContrato(sub.tenantId)
        .catch((err) => {
          console.error("[contrato] falha ao gerar:", err)
          return null
        })
        .then((contrato) =>
          sendPaymentConfirmedEmail(
            owner.email,
            owner.name ?? "Cliente",
            sub.plan.name,
            sub.tenant,
            contrato ? { nomeArquivo: contrato.nomeArquivo, buffer: contrato.buffer } : undefined
          )
        )
        .then(() => undefined)
        .catch((err) => {
          console.error("[confirmação] falha ao enviar o e-mail:", err)
        })
    : nada
  return { resultado: "ativada", pendente }
}
