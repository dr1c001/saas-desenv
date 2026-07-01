import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event, payment } = body

  // Map Asaas subscription id from payment object
  const asaasSubId: string | undefined = payment?.subscription

  if (!asaasSubId) return NextResponse.json({ ok: true })

  const sub = await prisma.subscription.findFirst({ where: { asaasId: asaasSubId } })
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

  return NextResponse.json({ ok: true })
}
