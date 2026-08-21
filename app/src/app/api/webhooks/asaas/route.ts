import { after, NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPaymentConfirmedEmail } from "@/lib/resend"
import { gerarContrato } from "@/lib/contrato"

// Espelha REFERRAL_DISCOUNT_PERCENT/NEW_SIGNUP_DISCOUNT_PERCENT em
// lib/auth.ts e api/referral/join/route.ts — bônus de quem indicou, creditado
// só na primeira confirmação de pagamento do indicado (não em renovações).
const REFERRER_DISCOUNT_PERCENT = 20
const MAX_DISCOUNT_PERCENT = 100

export async function POST(req: NextRequest) {
  // Asaas ecoa o token configurado no dashboard (Integrações → Webhooks) no
  // header "asaas-access-token" em toda chamada — sem isso, qualquer um podia
  // forjar eventos de pagamento (ex: ativar a própria assinatura sem pagar,
  // ou cancelar a de outro tenant). (Achado em revisão de segurança 2026-07-19.)
  const token = req.headers.get("asaas-access-token")
  if (!process.env.ASAAS_WEBHOOK_SECRET || token !== process.env.ASAAS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { event, payment } = body

    const asaasSubId: string | undefined = payment?.subscription
    if (!asaasSubId) return NextResponse.json({ ok: true })

    const sub = await prisma.subscription.findFirst({
      where: { asaasId: asaasSubId },
      include: {
        plan: { select: { name: true } },
        tenant: {
          select: {
            id: true,
            name: true,
            referredByCode: true,
            // locale: o e-mail de confirmação sai no idioma da empresa — webhook
            // roda fora de qualquer request de navegador, então não há contexto
            // pra resolver isso sozinho. (i18n, item 1.)
            locale: true,
            users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
          },
        },
      },
    })
    if (!sub) return NextResponse.json({ ok: true })

    // Só a primeira confirmação de pagamento desse tenant conta como
    // "conversão" pro bônus de quem indicou — renovações (sub já ACTIVE) e
    // recuperação de inadimplência (PAST_DUE) não geram um bônus novo.
    const isFirstConfirmation = sub.status === "PENDING"

    // Uma assinatura já CANCELLED (localmente) não deve ser reativada por um
    // pagamento atrasado/duplicado/reenviado do Asaas — isso "ressuscitava"
    // silenciosamente uma assinatura abandonada e sobrescrevia o plano do
    // tenant. PENDING/PAST_DUE → ACTIVE continuam permitidos (primeiro
    // pagamento e recuperação de inadimplência são fluxos legítimos).
    // (Achado em revisão de segurança 2026-07-19.)
    if ((event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") && sub.status !== "CANCELLED") {
      // Idempotência por pagamento: o Asaas manda PAYMENT_CONFIRMED
      // (autorização) e depois PAYMENT_RECEIVED (liquidação) pro MESMO
      // pagamento em cartão — fluxo normal, não reenvio de falha. Sem isso,
      // cada pagamento em cartão (toda renovação, não só a primeira) somava
      // um ciclo de acesso duas vezes. Update condicionado (não um read
      // separado) — seguro mesmo com as duas entregas chegando quase juntas.
      // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
      const paymentId: string | undefined = payment?.id
      const claim = paymentId
        ? await prisma.subscription.updateMany({
            where: {
              id: sub.id,
              OR: [{ lastProcessedPaymentId: null }, { lastProcessedPaymentId: { not: paymentId } }],
            },
            data: { lastProcessedPaymentId: paymentId },
          })
        : { count: 1 }
      if (claim.count === 0) {
        return NextResponse.json({ ok: true })
      }

      // Na primeira confirmação, currentPeriodEnd já foi calculado certo em
      // subscribeToPlan (criação + 1 ciclo) — somar mais um ciclo aqui em cima
      // dava 2 ciclos de acesso pelo preço de 1. Só renovação (assinatura já
      // tinha sido ACTIVE/PAST_DUE antes) de fato estende o período.
      // (Achado em revisão de segurança 2026-07-21.)
      const periodEnd = new Date(sub.currentPeriodEnd)
      if (!isFirstConfirmation) {
        periodEnd.setMonth(periodEnd.getMonth() + (sub.billingCycle === "YEARLY" ? 12 : 1))
      }

      // Primeira confirmação de pagamento é o único lugar que efetivamente
      // ativa o tenant — subscribeToPlan só cria a Subscription como PENDING
      // e não mexe no plano do tenant, então planId precisa ser setado aqui.
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          // Zera os avisos de atraso: se este cliente ficar inadimplente de
          // novo daqui a alguns meses, o ciclo de avisos precisa recomeçar do
          // primeiro, não continuar de onde parou.
          data: { status: "ACTIVE", currentPeriodEnd: periodEnd, pastDueWarningsSent: 0 },
        }),
        prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { subscriptionStatus: "ACTIVE", planId: sub.planId },
        }),
      ])

      // Bônus de quem indicou — melhor esforço, nunca deve derrubar a
      // ativação do tenant que acabou de pagar nem o e-mail de confirmação.
      if (isFirstConfirmation && sub.tenant.referredByCode) {
        try {
          const referrer = await prisma.tenant.findUnique({
            where: { referralCode: sub.tenant.referredByCode },
            select: { id: true },
          })
          if (referrer) {
            // increment é atômico no banco (SET col = col + N) — não lê o
            // valor antes, então duas confirmações concorrentes pro mesmo
            // indicador não perdem incremento uma da outra (o que acontecia
            // com o Math.min(valor lido + 20, 100) anterior, um lost update
            // clássico). O teto vem depois, num update condicionado no valor
            // atual da linha — também seguro sob corrida.
            // (Achado em revisão de segurança 2026-07-21.)
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

      const owner = sub.tenant.users[0]
      if (owner?.email) {
        // Gera o contrato e anexa. Melhor esforço, e DEPOIS da resposta: o
        // webhook precisa responder rápido pra Asaas, e falhar em gerar PDF
        // nunca pode impedir a ativação do cliente que acabou de pagar.
        //
        // Dentro de after(). Sem ele, a promessa era só disparada e esquecida:
        // em runtime serverless a instância pode ser congelada assim que o
        // handler retorna, e o trabalho pendente morre no meio. O cliente
        // pagava, era ativado, e simplesmente não recebia o e-mail de
        // confirmação nem o contrato — que é o documento da relação comercial.
        // Sem erro no Sentry (o catch engole) e sem linha no log. after() é a
        // forma que o Next.js dá de dizer "só congele depois disto".
        // (Achado em auditoria, 20/08/2026.)
        after(
          gerarContrato(sub.tenantId)
            .catch((err) => {
              console.error("[contrato] falha ao gerar:", err)
              return null
            })
            .then((contrato) =>
              sendPaymentConfirmedEmail(
                owner.email,
                owner.name ?? "Cliente",
                sub.plan.name,
                sub.tenant.locale,
                contrato ? { nomeArquivo: contrato.nomeArquivo, buffer: contrato.buffer } : undefined
              )
            )
            .catch(() => null)
        )
      }
    }

    // PAYMENT_OVERDUE/SUBSCRIPTION_DELETED só rebaixam o tenant se essa
    // assinatura chegou a estar ACTIVE de verdade. Uma assinatura PENDING
    // abandonada (nunca paga) que o Asaas cancela por vencimento não deve
    // derrubar um tenant que ainda está em trial válido — ele nunca ganhou
    // acesso por causa dela, então não há nada a revogar no tenant.
    if (event === "PAYMENT_OVERDUE" && sub.status === "ACTIVE") {
      await prisma.$transaction([
        prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } }),
        prisma.tenant.update({ where: { id: sub.tenantId }, data: { subscriptionStatus: "PAST_DUE" } }),
      ])
    }

    if (event === "SUBSCRIPTION_DELETED") {
      if (sub.status === "ACTIVE") {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          }),
          prisma.tenant.update({
            where: { id: sub.tenantId },
            data: { subscriptionStatus: "CANCELLED", planId: null },
          }),
        ])
      } else {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        })
      }
    }
  } catch {
    // never return 5xx to Asaas or it will retry indefinitely
  }

  return NextResponse.json({ ok: true })
}
