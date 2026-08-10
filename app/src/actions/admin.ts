"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  COOKIE_IMPERSONACAO,
  registrarAcaoAdmin,
  requireSuperAdmin,
  tenantImpersonado,
} from "@/lib/admin"

// Estas são as ações mais poderosas do sistema: mexem no acesso e na cobrança
// de empresas clientes. TODAS começam por requireSuperAdmin() — a checagem do
// app/admin/layout.tsx não protege nenhuma delas, porque Server Action tem ID
// próprio e é despachável direto, sem passar por layout algum.

/**
 * Destrava uma empresa que pagou mas ficou presa em PENDING.
 *
 * Existe por causa de 07/08/2026: uma cliente pagou, o webhook da Asaas estava
 * apontando pro domínio antigo, e ela ficou um dia sem acesso. Resolver exigiu
 * eu mexer no banco à mão. Com isto, o dono resolve sozinho em 10 segundos.
 */
export async function liberarAcesso(tenantId: string) {
  const admin = await requireSuperAdmin()

  const antes = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, name: true },
  })
  if (!antes) throw new Error("Empresa não encontrada.")

  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "ACTIVE" } })
  // A Subscription mais recente também vira ACTIVE: hasActiveSubscription lê o
  // Tenant, mas a carência de PAST_DUE e a tela de cobrança leem a Subscription
  // — deixar as duas discordando produz bug difícil de enxergar depois.
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) await prisma.subscription.update({ where: { id: ultima.id }, data: { status: "ACTIVE" } })

  await registrarAcaoAdmin(admin, "liberar_acesso", tenantId, `${antes.name}: ${antes.subscriptionStatus} → ACTIVE`)
  revalidatePath("/admin")
}

/** Encerra o acesso. Não cancela a cobrança na Asaas — isso continua sendo
 *  feito pelo cliente em /billing ou por você no painel da Asaas. Aqui é só o
 *  acesso ao sistema, e o texto na tela diz isso. */
export async function cancelarAcesso(tenantId: string) {
  const admin = await requireSuperAdmin()

  const antes = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, name: true },
  })
  if (!antes) throw new Error("Empresa não encontrada.")

  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "CANCELLED" } })
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) {
    await prisma.subscription.update({
      where: { id: ultima.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  }

  await registrarAcaoAdmin(admin, "cancelar", tenantId, `${antes.name}: ${antes.subscriptionStatus} → CANCELLED`)
  revalidatePath("/admin")
}

/** Troca o plano de uma empresa (ex.: negociou Enterprise por telefone).
 *  Reflete na hora no que ela tem liberado, pelas travas de lib/plan.ts. */
export async function trocarPlano(tenantId: string, planId: string) {
  const admin = await requireSuperAdmin()

  const [tenant, plano] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, planId: true } }),
    prisma.plan.findUnique({ where: { id: planId }, select: { name: true } }),
  ])
  if (!tenant) throw new Error("Empresa não encontrada.")
  if (!plano) throw new Error("Plano não encontrado.")

  const anterior = tenant.planId
    ? (await prisma.plan.findUnique({ where: { id: tenant.planId }, select: { name: true } }))?.name
    : null

  await prisma.tenant.update({ where: { id: tenantId }, data: { planId } })
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) await prisma.subscription.update({ where: { id: ultima.id }, data: { planId } })

  await registrarAcaoAdmin(admin, "trocar_plano", tenantId, `${tenant.name}: ${anterior ?? "sem plano"} → ${plano.name}`)
  revalidatePath("/admin")
}

/** Entra na conta do cliente para dar suporte. */
export async function entrarNaConta(tenantId: string) {
  const admin = await requireSuperAdmin()

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  if (!tenant) throw new Error("Empresa não encontrada.")

  const jar = await cookies()
  jar.set(COOKIE_IMPERSONACAO, tenantId, {
    httpOnly: true, // fora do alcance de qualquer JavaScript da página
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Sessão de suporte é curta de propósito: esquecer que está "vendo como"
    // um cliente é o jeito mais fácil de fazer besteira na conta dele.
    maxAge: 60 * 60,
  })

  await registrarAcaoAdmin(admin, "entrar_na_conta", tenantId, tenant.name)
  redirect("/dashboard")
}

export async function sairDaConta() {
  const admin = await requireSuperAdmin()
  const alvo = await tenantImpersonado()

  const jar = await cookies()
  jar.delete(COOKIE_IMPERSONACAO)

  if (alvo) await registrarAcaoAdmin(admin, "sair_da_conta", alvo)
  redirect("/admin")
}
