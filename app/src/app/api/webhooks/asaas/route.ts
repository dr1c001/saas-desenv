import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPaymentConfirmedEmail } from "@/lib/resend"

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
      const periodEnd = new Date(sub.currentPeriodEnd)
      periodEnd.setMonth(periodEnd.getMonth() + (sub.billingCycle === "YEARLY" ? 12 : 1))

      // Primeira confirmação de pagamento é o único lugar que efetivamente
      // ativa o tenant — subscribeToPlan só cria a Subscription como PENDING
      // e não mexe no plano do tenant, então planId precisa ser setado aqui.
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "ACTIVE", currentPeriodEnd: periodEnd },
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
            select: { id: true, referralDiscountPercent: true },
          })
          if (referrer) {
            await prisma.tenant.update({
              where: { id: referrer.id },
              data: {
                referralDiscountPercent: Math.min(
                  referrer.referralDiscountPercent + REFERRER_DISCOUNT_PERCENT,
                  MAX_DISCOUNT_PERCENT
                ),
              },
            })
          }
        } catch (err) {
          console.error("Falha ao creditar bônus de indicação:", err)
        }
      }

      const owner = sub.tenant.users[0]
      if (owner?.email) {
        sendPaymentConfirmedEmail(owner.email, owner.name ?? "Cliente", sub.plan.name).catch(() => null)
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
