import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { sendWelcomeEmail } from "@/lib/resend"

export async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return user
}

export async function getTenant() {
  const user = await getSession()

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, role: true },
  })

  // Fallback: create tenant+user if not in DB yet
  if (!dbUser) {
    const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário"
    const existingTenantId: string | undefined = user.user_metadata?.tenantId

    let tenantId: string
    let role: "OWNER" | "ADMIN" | "TECHNICIAN" = "OWNER"

    if (existingTenantId) {
      // Invited team member — join existing tenant
      tenantId = existingTenantId
      role = (user.user_metadata?.role as typeof role) ?? "TECHNICIAN"
    } else {
      // New owner — create a tenant
      const companyName = user.user_metadata?.company_name ?? `Empresa de ${name}`
      const refCode: string | undefined = user.user_metadata?.ref_code

      let extraDays = 0
      if (refCode) {
        const referrer = await prisma.tenant.findFirst({ where: { referralCode: refCode }, select: { id: true } })
        if (referrer) extraDays = 7
      }

      const trialEndsAt = new Date(Date.now() + (15 + extraDays) * 24 * 60 * 60 * 1000)
      const tenant = await prisma.tenant.create({
        data: { name: companyName, trialEndsAt, referredByCode: refCode ?? null },
      })
      tenantId = tenant.id
      sendWelcomeEmail(user.email!, name).catch(() => null)
    }

    const created = await prisma.user.create({
      data: { id: user.id, name, email: user.email!, role, tenantId },
      select: { tenantId: true, role: true },
    })
    dbUser = created
  }

  return { userId: user.id, tenantId: dbUser.tenantId, role: dbUser.role }
}

// Tabs available in the system (slug → display info)
export const ALL_TABS = [
  { slug: "dashboard", label: "Dashboard" },
  { slug: "clients", label: "Clientes" },
  { slug: "service-orders", label: "Ordens de Serviço" },
  { slug: "history", label: "Histórico" },
  { slug: "maintenance", label: "Manutenção Interna" },
  { slug: "providers", label: "Prestadores" },
  { slug: "receipts", label: "Recibos" },
  { slug: "schedule", label: "Agendamento" },
  { slug: "finance", label: "Financeiro" },
  { slug: "reports", label: "Relatórios" },
  { slug: "team", label: "Equipe" },
  { slug: "map", label: "Mapa GPS" },
  { slug: "quotes", label: "Orçamentos" },
  { slug: "billing", label: "Assinatura" },
  { slug: "fiscal", label: "Config. Fiscal" },
  { slug: "referral", label: "Indicação" },
] as const

export type TabSlug = (typeof ALL_TABS)[number]["slug"]

// Tabs technician gets by default (admin can change this per-tenant)
export const DEFAULT_TECHNICIAN_TABS: TabSlug[] = ["dashboard", "service-orders", "schedule"]

export async function getAllowedTabs(tenantId: string, role: string): Promise<TabSlug[]> {
  if (role === "OWNER" || role === "ADMIN") {
    return ALL_TABS.map((t) => t.slug)
  }

  // TECHNICIAN: check TabPermission table; fall back to defaults
  const perms = await prisma.tabPermission.findMany({
    where: { tenantId, role: role as never },
    select: { tab: true },
  })

  if (perms.length === 0) return DEFAULT_TECHNICIAN_TABS
  return perms.map((p) => p.tab as TabSlug)
}
