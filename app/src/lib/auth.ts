import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { sendWelcomeEmail } from "@/lib/resend"
import { Prisma } from "@/generated/prisma/client"

// Bônus de indicação pra quem se cadastra com um código válido — antes era
// dias extra de trial; sem trial (o acesso agora exige assinatura paga),
// virou desconto no primeiro pagamento. Espelha NEW_SIGNUP_DISCOUNT_PERCENT
// em api/referral/join/route.ts (mesmo conceito, caminho de cadastro diferente).
const NEW_SIGNUP_DISCOUNT_PERCENT = 10

// Allowlist estrita pro parâmetro "next" usado nos redirects pós-autenticação
// (callback OAuth, confirmação de convite/recuperação de senha): só caminho
// relativo simples. String concatenation direta (`${origin}${next}`) seria
// vulnerável a "next=@evil.com/x" — a URL resultante "https://real-app.com@evil.com/x"
// é interpretada com "real-app.com" como userinfo e "evil.com" como host de
// verdade. Bloqueia também "//evil.com" e "/\evil.com" (protocol-relative —
// navegadores tratam \ como / em URLs http/https). (Revisão de segurança 2026-07-19.)
export function safeNextPath(next: string | null): string {
  if (next && !next.startsWith("//") && /^\/[a-zA-Z0-9\-_/]*$/.test(next)) return next
  return "/dashboard"
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return user
}

export async function getTenant() {
  const user = await getSession()

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      tenantId: true,
      role: true,
      tenant: { select: { subscriptionStatus: true, trialEndsAt: true } },
    },
  })

  // Fallback: create a new tenant if this user has no User row yet (one-time
  // cost on first login). Invited team members already get their User row
  // created server-side at invite time (see inviteTeamMember in actions/team.ts),
  // so reaching this branch always means a brand-new signup.
  //
  // IMPORTANT: never trust user.user_metadata.tenantId/role to join an existing
  // tenant here. user_metadata is editable by the user themselves via the
  // Supabase client SDK (supabase.auth.updateUser), so honoring it would let
  // anyone join — or, after being removed, silently rejoin — any tenant as
  // OWNER just by knowing its id. (Found in security review 2026-07-19.)
  if (!dbUser) {
    const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário"
    const companyName = user.user_metadata?.company_name ?? `Empresa de ${name}`
    const refCode: string | undefined = user.user_metadata?.ref_code

    let referralDiscountPercent = 0
    if (refCode) {
      const referrer = await prisma.tenant.findFirst({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer) referralDiscountPercent = NEW_SIGNUP_DISCOUNT_PERCENT
    }

    // Sem trial: o tenant nasce sem acesso, bloqueado até a primeira assinatura
    // ser confirmada (ver gating em (dashboard)/layout.tsx).
    const tenant = await prisma.tenant.create({
      data: { name: companyName, referredByCode: refCode ?? null, referralDiscountPercent },
    })
    const tenantId = tenant.id
    const role = "OWNER" as const
    const tenantStatus = { subscriptionStatus: tenant.subscriptionStatus, trialEndsAt: tenant.trialEndsAt }
    sendWelcomeEmail(user.email!, name).catch(() => null)

    try {
      await prisma.user.create({
        data: { id: user.id, name, email: user.email!, role, tenantId },
      })
    } catch (err) {
      // Duas requisicoes concorrentes podem cair aqui ao mesmo tempo no primeiro
      // login (ex: layout + page chamando getTenant() em paralelo antes do User
      // existir). Se outra ja ganhou a corrida e criou o User (violação de
      // unique constraint no id), usa os dados dela em vez de duplicar tenant.
      const lostRace =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
      if (!lostRace) throw err

      // O tenant que acabamos de criar ficou orfao (sem User) — remove.
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => null)

      const winner = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          tenantId: true,
          role: true,
          tenant: { select: { subscriptionStatus: true, trialEndsAt: true } },
        },
      })
      return {
        userId: user.id,
        tenantId: winner.tenantId,
        role: winner.role,
        tenantStatus: winner.tenant,
      }
    }

    return { userId: user.id, tenantId, role, tenantStatus }
  }

  return {
    userId: user.id,
    tenantId: dbUser.tenantId,
    role: dbUser.role,
    tenantStatus: dbUser.tenant,
  }
}

// Dias de carência após o fim do período pago antes de bloquear de vez um
// tenant PAST_DUE — evita perder cliente por uma falha pontual de cobrança
// (cartão expirado, saldo momentâneo) que uma nova tentativa resolveria.
// Compartilhado entre o gating de página ((dashboard)/layout.tsx) e o de
// Server Action (requireActiveSubscription) — nunca duplicar essa conta.
const PAST_DUE_GRACE_DAYS = 3

export async function hasActiveSubscription(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true },
  })
  if (tenant?.subscriptionStatus === "ACTIVE") return true
  if (tenant?.subscriptionStatus !== "PAST_DUE") return false

  // A carência olha só pra Subscription que está de fato PAST_DUE — pegar "a
  // mais recente" sem esse filtro deixava qualquer Subscription PENDING nova
  // (criada só ao clicar "Assinar", antes de qualquer pagamento) resetar o
  // acesso sem nunca pagar. (Achado em revisão de segurança 2026-07-21.)
  const latestSub = await prisma.subscription.findFirst({
    where: { tenantId, status: "PAST_DUE" },
    orderBy: { createdAt: "desc" },
    select: { currentPeriodEnd: true },
  })
  if (!latestSub) return false

  const graceEnd = new Date(latestSub.currentPeriodEnd)
  graceEnd.setDate(graceEnd.getDate() + PAST_DUE_GRACE_DAYS)
  return new Date() < graceEnd
}

// Toda Server Action que usa dado/recurso do produto precisa chamar isso —
// bloqueio de página (layout) não protege a Action em si, que é um endpoint
// despachável independente de qual UI a invoca. (Achado em revisão de
// segurança 2026-07-21 — nenhuma Action verificava assinatura, só papel.)
export async function requireActiveSubscription(tenantId: string) {
  if (!(await hasActiveSubscription(tenantId))) {
    throw new Error("Assinatura inativa. Assine um plano para continuar usando o sistema.")
  }
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
