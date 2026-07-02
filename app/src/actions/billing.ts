"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { asaas } from "@/lib/asaas"

export async function getBillingStatus() {
  const { tenantId } = await getTenant()

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceYearly: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, billingCycle: true, currentPeriodEnd: true },
      },
    },
  })

  return tenant
}

export async function getPlans() {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceMonthly: "asc" },
  })
}

export async function subscribeToPlan(formData: FormData) {
  const { tenantId } = await getTenant()
  const planId = formData.get("planId") as string
  const cycle = (formData.get("cycle") as "MONTHLY" | "YEARLY") ?? "MONTHLY"

  try {
    const [plan, tenant] = await Promise.all([
      prisma.plan.findUnique({ where: { id: planId } }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { users: { where: { role: "OWNER" }, take: 1 } },
      }),
    ])

    if (!plan || !tenant) {
      redirect("/billing?error=" + encodeURIComponent("Plano não encontrado."))
    }

    const owner = tenant.users[0]
    if (!owner) {
      redirect("/billing?error=" + encodeURIComponent("Proprietário da conta não encontrado."))
    }
    const price = cycle === "YEARLY" ? Number(plan.priceYearly) : Number(plan.priceMonthly)

    // Create or reuse Asaas customer
    let asaasCustomerId = tenant.asaasCustomerId
    if (!asaasCustomerId) {
      const customer = await asaas.createCustomer({
        name: tenant.name,
        email: owner?.email ?? "",
      })
      asaasCustomerId = customer.id
      await prisma.tenant.update({ where: { id: tenantId }, data: { asaasCustomerId } })
    }

    // Next due date = today
    const nextDueDate = new Date().toISOString().split("T")[0]

    const sub = await asaas.createSubscription({
      customer: asaasCustomerId,
      billingType: "PIX",
      value: price,
      nextDueDate,
      cycle: cycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      description: `${plan.name} — ${cycle === "YEARLY" ? "Anual" : "Mensal"}`,
    })

    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + (cycle === "YEARLY" ? 12 : 1))

    await prisma.$transaction([
      prisma.subscription.create({
        data: {
          tenantId,
          planId,
          asaasId: sub.id,
          status: "ACTIVE",
          billingCycle: cycle,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      }),
      prisma.tenant.update({
        where: { id: tenantId },
        data: { planId, subscriptionStatus: "ACTIVE" },
      }),
    ])
  } catch (err) {
    // redirect() throws internally in Next.js — let it propagate
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    if (msg.includes("NEXT_REDIRECT")) throw err
    redirect("/billing?error=" + encodeURIComponent(msg))
  }

  revalidatePath("/billing")
  redirect("/billing?success=1")
}

export async function cancelSubscription() {
  const { tenantId } = await getTenant()

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  })

  if (sub?.asaasId) {
    await asaas.cancelSubscription(sub.asaasId).catch(() => null)
  }

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "CANCELLED", planId: null },
  })

  revalidatePath("/billing")
}
