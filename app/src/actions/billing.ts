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
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") {
    redirect("/billing?error=" + encodeURIComponent("Sem permissão."))
  }
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
    if (!tenant.document) {
      redirect(
        "/billing?error=" +
          encodeURIComponent("Preencha o CNPJ/CPF da empresa em Configurações antes de assinar um plano.")
      )
    }
    const fullPrice = cycle === "YEARLY" ? Number(plan.priceYearly) : Number(plan.priceMonthly)
    // Desconto de indicação (creditado por quem indicou/foi indicado — ver
    // lib/auth.ts, api/referral/join, api/webhooks/asaas) aplicado uma vez,
    // no primeiro pagamento desta assinatura, e consumido logo abaixo.
    const discountPercent = tenant.referralDiscountPercent
    const price = fullPrice * (1 - discountPercent / 100)

    // Create or reuse Asaas customer
    let asaasCustomerId = tenant.asaasCustomerId
    if (!asaasCustomerId) {
      const customer = await asaas.createCustomer({
        name: tenant.name,
        email: owner?.email ?? "",
        cpfCnpj: tenant.document,
      })
      asaasCustomerId = customer.id
      await prisma.tenant.update({ where: { id: tenantId }, data: { asaasCustomerId } })
    } else {
      // Cliente ja existia (ex: tentativa anterior que falhou so na assinatura) —
      // garante que o CPF/CNPJ esta no cadastro do Asaas, exigido pelo billingType UNDEFINED.
      await asaas.updateCustomer(asaasCustomerId, { cpfCnpj: tenant.document })
    }

    // Next due date = today
    const nextDueDate = new Date().toISOString().split("T")[0]

    const sub = await asaas.createSubscription({
      customer: asaasCustomerId,
      billingType: "UNDEFINED",
      value: price,
      nextDueDate,
      cycle: cycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      description: `${plan.name} — ${cycle === "YEARLY" ? "Anual" : "Mensal"}`,
    })

    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + (cycle === "YEARLY" ? 12 : 1))

    // Fica PENDING até o webhook do Asaas confirmar o pagamento (evento
    // PAYMENT_RECEIVED/PAYMENT_CONFIRMED) — nem Subscription.status nem
    // Tenant.subscriptionStatus viram ACTIVE aqui, senão qualquer um ganha
    // acesso pago só de preencher o formulário, sem pagar nada.
    // (Achado em revisão de segurança 2026-07-19.)
    await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        asaasId: sub.id,
        status: "PENDING",
        billingCycle: cycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
    })

    if (discountPercent > 0) {
      await prisma.tenant.update({ where: { id: tenantId }, data: { referralDiscountPercent: 0 } })
    }

    revalidatePath("/billing")

    // Leva o cliente direto pra pagina de pagamento hospedada pelo Asaas
    // (preenche dados + cartao la, nunca no nosso servidor). Se por algum
    // motivo a fatura ainda nao estiver disponivel, cai no fluxo antigo.
    const invoiceUrl = await asaas.getFirstInvoiceUrl(sub.id).catch(() => null)
    if (invoiceUrl) redirect(invoiceUrl)
  } catch (err) {
    // redirect() throws internally in Next.js — let it propagate
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    if (msg.includes("NEXT_REDIRECT")) throw err
    redirect("/billing?error=" + encodeURIComponent(msg))
  }

  redirect("/billing?success=1")
}

export async function cancelSubscription() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") return

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  })

  // Sem assinatura ACTIVE, não há nada real pra cancelar — antes disso o
  // tenant era marcado CANCELLED incondicionalmente aqui embaixo, o que
  // bloqueava até um tenant só em TRIAL. (Achado em revisão de segurança 2026-07-19.)
  if (!sub) return

  if (sub.asaasId) {
    try {
      await asaas.cancelSubscription(sub.asaasId)
    } catch (err) {
      // Não marca como cancelado localmente se o cancelamento real no Asaas
      // falhou — senão o app mostra "cancelado" enquanto o Asaas continua
      // cobrando, sem ninguém saber. (Achado em revisão de segurança 2026-07-19.)
      console.error("Falha ao cancelar assinatura no Asaas:", err)
      redirect("/billing?error=" + encodeURIComponent("Não foi possível cancelar agora. Tente novamente em instantes."))
    }
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "CANCELLED", planId: null },
  })

  revalidatePath("/billing")
}
