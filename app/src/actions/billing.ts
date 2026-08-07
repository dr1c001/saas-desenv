"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { asaas } from "@/lib/asaas"
import { getTranslations } from "next-intl/server"

export async function getBillingStatus() {
  const { tenantId } = await getTenant()

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      referralDiscountPercent: true,
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
  const tb = await getTranslations("billingReferral")
  const tc = await getTranslations("common")
  if (role !== "OWNER" && role !== "ADMIN") {
    redirect("/billing?error=" + encodeURIComponent(tc("noPermission")))
  }

  // Sem isso, duplo clique/retry de rede cria duas Subscriptions reais na
  // Asaas (duas cobranças recorrentes paralelas) — nada impedia reenviar o
  // form. Também cobre reassinar enquanto já tem uma PENDING/ACTIVE (troca
  // de plano não é suportada ainda — precisa cancelar antes).
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ["PENDING", "ACTIVE"] } },
  })
  if (existingSub) {
    redirect(
      "/billing?error=" +
        encodeURIComponent(
          existingSub.status === "PENDING"
            ? tb("errors.subscriptionPending")
            : tb("errors.subscriptionActive")
        )
    )
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
      redirect("/billing?error=" + encodeURIComponent(tb("errors.planNotFound")))
    }

    const owner = tenant.users[0]
    if (!owner) {
      redirect("/billing?error=" + encodeURIComponent(tb("errors.ownerNotFound")))
    }
    if (!tenant.document) {
      redirect(
        "/billing?error=" +
          encodeURIComponent(tb("errors.missingDocument"))
      )
    }
    const fullPrice = cycle === "YEARLY" ? Number(plan.priceYearly) : Number(plan.priceMonthly)
    // Desconto de indicação (creditado por quem indicou/foi indicado — ver
    // lib/auth.ts, api/referral/join, api/webhooks/asaas) aplicado uma vez,
    // no primeiro pagamento desta assinatura, e consumido logo abaixo.
    const discountPercent = tenant.referralDiscountPercent
    // Arredondado antes de virar payload pra Asaas — fullPrice * (1 - N/100)
    // gera resto de ponto flutuante pra praticamente qualquer desconto
    // != 0/50 (ex: 197 * 0.8 = 157.60000000000002), e mandar isso cru numa
    // API de pagamento não é uma prática correta de dinheiro, mesmo que a
    // Asaas provavelmente arredonde do lado dela.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    const price = Math.round(fullPrice * (1 - discountPercent / 100) * 100) / 100

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
    // Tenant.subscriptionStatus também vira PENDING aqui — antes ficava
    // travado em TRIAL até o webhook confirmar, e /expired (que já tem uma
    // tela específica de "confirmando pagamento") nunca conseguia mostrar
    // essa tela: um cliente que voltasse pro app entre assinar e o webhook
    // confirmar via "Assine um plano" como se nunca tivesse tentado.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    await prisma.$transaction([
      prisma.subscription.create({
        data: {
          tenantId,
          planId,
          asaasId: sub.id,
          status: "PENDING",
          billingCycle: cycle,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      }),
      prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "PENDING" } }),
    ])

    if (discountPercent > 0) {
      // CAS: só zera se o valor não mudou desde que lemos acima — evita tanto
      // apagar um crédito mais novo (ex: webhook creditando bônus de
      // indicação enquanto essa chamada à Asaas estava em andamento) quanto
      // duas submissões concorrentes gastarem o mesmo saldo de desconto duas
      // vezes. (Achado em revisão de segurança 2026-07-21.)
      await prisma.tenant.updateMany({
        where: { id: tenantId, referralDiscountPercent: discountPercent },
        data: { referralDiscountPercent: 0 },
      })
    }

    revalidatePath("/billing")

    // Leva o cliente direto pra pagina de pagamento hospedada pelo Asaas
    // (preenche dados + cartao la, nunca no nosso servidor). Se por algum
    // motivo a fatura ainda nao estiver disponivel, cai no fluxo antigo.
    const invoiceUrl = await asaas.getFirstInvoiceUrl(sub.id).catch((err) => {
      // A assinatura real já foi criada na Asaas nesse ponto — isso só afeta
      // o link imediato na tela (o cliente ainda recebe a fatura por
      // e-mail), mas precisa ficar visível pra debugar se acontecer de
      // verdade. (Achado verificando o sistema antes da primeira venda,
      // 2026-08-03.)
      console.error("Falha ao buscar link da fatura da assinatura", sub.id, err)
      return null
    })
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
  const tb = await getTranslations("billingReferral")
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
      redirect("/billing?error=" + encodeURIComponent(tb("errors.cancelFailed")))
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
