import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPaymentConfirmedEmail } from "@/lib/resend"

export async function POST(req: NextRequest) {
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
            users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
          },
        },
      },
    })
    if (!sub) return NextResponse.json({ ok: true })

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const periodEnd = new Date(sub.currentPeriodEnd)
      periodEnd.setMonth(periodEnd.getMonth() + (sub.billingCycle === "YEARLY" ? 12 : 1))

      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "ACTIVE", currentPeriodEnd: periodEnd },
        }),
        prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { subscriptionStatus: "ACTIVE" },
        }),
      ])

      const owner = sub.tenant.users[0]
      if (owner?.email) {
        sendPaymentConfirmedEmail(owner.email, owner.name ?? "Cliente", sub.plan.name).catch(() => null)
      }
    }

    if (event === "PAYMENT_OVERDUE") {
      await prisma.$transaction([
        prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } }),
        prisma.tenant.update({ where: { id: sub.tenantId }, data: { subscriptionStatus: "PAST_DUE" } }),
      ])
    }

    if (event === "SUBSCRIPTION_DELETED") {
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
    }
  } catch {
    // never return 5xx to Asaas or it will retry indefinitely
  }

  return NextResponse.json({ ok: true })
}
