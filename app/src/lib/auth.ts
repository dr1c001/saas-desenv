import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getLimites, type Recurso } from "@/lib/plan"
import { tenantImpersonado } from "@/lib/admin"
import { PAST_DUE_GRACE_DAYS } from "@/lib/past-due"
import { redirect } from "next/navigation"
import { sendWelcomeEmail } from "@/lib/resend"
import { Prisma } from "@/generated/prisma/client"
import { getTranslations } from "next-intl/server"

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

// cache() deduplica chamadas com os mesmos argumentos dentro do mesmo
// request/render — layout.tsx e a page chamam getTenant() em paralelo no
// primeiro carregamento, e sem isso as duas caiam na branch de "criar tenant
// novo" ao mesmo tempo, mandando e-mail de boas-vindas duplicado (a corrida
// no prisma.user.create já era tratada, mas o envio do e-mail acontecia
// antes dessa checagem). (Achado verificando o sistema antes da primeira
// venda, 2026-08-03.)
export const getTenant = cache(async function getTenant() {
  const user = await getSession()

  // ── Suporte: o dono da plataforma vendo o sistema como uma empresa cliente ──
  // tenantImpersonado() só devolve algo se DUAS coisas forem verdade: existe o
  // cookie, e a sessão real — verificada junto ao Supabase, não lida do cookie
  // — é a do dono da plataforma. O cookie sozinho não concede absolutamente
  // nada; forjá-lo em outra conta não faz efeito nenhum.
  //
  // Sem o cookie a função retorna antes de qualquer verificação, então o
  // caminho normal de todas as outras requisições não paga nada por isto.
  //
  // Devolve o papel e o id do DONO daquela empresa: é o que faz o suporte
  // enxergar exatamente o que o cliente enxerga, incluindo bloqueio por
  // assinatura vencida. Toda entrada e saída fica no AdminAuditLog.
  const alvoImpersonado = await tenantImpersonado()
  if (alvoImpersonado) {
    const anfitriao =
      (await prisma.user.findFirst({
        where: { tenantId: alvoImpersonado, role: "OWNER" },
        select: { id: true, tenantId: true, role: true, tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } } },
      })) ??
      // Empresa sem OWNER é anomalia, mas não pode impedir o suporte de olhar.
      (await prisma.user.findFirst({
        where: { tenantId: alvoImpersonado },
        select: { id: true, tenantId: true, role: true, tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } } },
      }))

    // Sem nenhum usuário, não há o que ver — segue para a conta real em vez de
    // deixar o admin numa tela quebrada.
    if (anfitriao) {
      return {
        userId: anfitriao.id,
        tenantId: anfitriao.tenantId,
        role: anfitriao.role,
        tenantStatus: anfitriao.tenant,
        locale: anfitriao.tenant.locale,
      }
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      tenantId: true,
      role: true,
      tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } },
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
    const te = await getTranslations("errors")
    const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? te("defaultUserName")
    const companyName = user.user_metadata?.company_name ?? te("defaultCompanyName", { name })
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
    // Tenant recém-criado: locale ainda é o default (pt) — o idioma da empresa
    // só é escolhido depois, em Configurações. (i18n, item 1.)
    sendWelcomeEmail(user.email!, name, tenant.locale).catch(() => null)

    try {
      await prisma.user.create({
        data: { id: user.id, name, email: user.email!, role, tenantId },
      })
    } catch (err) {
      // Duas requisicoes concorrentes podem cair aqui ao mesmo tempo no primeiro
      // login (ex: layout + page chamando getTenant() em paralelo antes do User
      // existir). Se outra ja ganhou a corrida e criou o User (violação de
      // unique constraint no id), usa os dados dela em vez de duplicar tenant.
      const isConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
      if (!isConflict) throw err

      // email também é @unique — se o conflito foi nele (não no id), não é a
      // corrida esperada: é uma linha de User órfã com este e-mail apontando
      // pra outro id (ex: sequela de uma recriação manual de conta). Nesse
      // caso findUniqueOrThrow por id abaixo explodiria com "not found" em
      // vez de explicar a causa real. (Achado em auditoria pré-venda,
      // 2026-08-05.)
      const target = (err.meta?.target as string[] | undefined) ?? []
      if (!target.includes("id")) {
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => null)
        throw new Error(
          (await getTranslations("errors"))("duplicateEmailAccount", { email: user.email ?? "" })
        )
      }

      // O tenant que acabamos de criar ficou orfao (sem User) — remove.
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => null)

      const winner = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          tenantId: true,
          role: true,
          tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } },
        },
      })
      return {
        userId: user.id,
        tenantId: winner.tenantId,
        role: winner.role,
        tenantStatus: winner.tenant,
        locale: winner.tenant.locale,
      }
    }

    return { userId: user.id, tenantId, role, tenantStatus, locale: tenant.locale }
  }

  return {
    userId: user.id,
    tenantId: dbUser.tenantId,
    role: dbUser.role,
    tenantStatus: dbUser.tenant,
    locale: dbUser.tenant.locale,
  }
})

// A carência mora em lib/past-due.ts, junto com a regra dos avisos por e-mail
// que dependem dela — um número só, num lugar só.

// cache() do React: memoriza por requisição. Sem isto, esta função ia ao banco
// buscar a MESMA linha de Tenant uma vez no layout e mais uma vez a cada
// requireActiveSubscription() — e há de 4 a 6 deles por arquivo de actions. No
// dashboard davam 3 idas ao banco pela mesma informação.
//
// É seguro porque nada altera a assinatura e relê no mesmo request:
// subscribeToPlan escreve PENDING e redireciona sem reler, e o webhook da
// Asaas não chama esta função. (Conferido antes de cachear — servir estado de
// assinatura velho foi o que deixou uma cliente sem acesso em 07/08/2026.)
export const hasActiveSubscription = cache(async function hasActiveSubscription(
  tenantId: string
): Promise<boolean> {
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
})

// Toda Server Action que usa dado/recurso do produto precisa chamar isso —
// bloqueio de página (layout) não protege a Action em si, que é um endpoint
// despachável independente de qual UI a invoca. (Achado em revisão de
// segurança 2026-07-21 — nenhuma Action verificava assinatura, só papel.)
export async function requireActiveSubscription(tenantId: string) {
  if (!(await hasActiveSubscription(tenantId))) {
    throw new Error((await getTranslations("errors"))("inactiveSubscription"))
  }
}

// Tabs available in the system. O rótulo NÃO vive aqui: este é um const de
// módulo (sem request context pra resolver idioma) e os mesmos nomes já
// existem traduzidos no namespace `nav`, usado pela sidebar — duplicar aqui
// deixaria a tela de Permissões em português fixo mesmo com a conta em
// inglês. navKey mapeia slug → chave de nav. (i18n, 07/08/2026.)
export const ALL_TABS = [
  { slug: "dashboard", navKey: "dashboard" },
  { slug: "clients", navKey: "clients" },
  { slug: "service-orders", navKey: "serviceOrders" },
  { slug: "history", navKey: "history" },
  { slug: "maintenance", navKey: "maintenance" },
  { slug: "providers", navKey: "providers" },
  { slug: "receipts", navKey: "receipts" },
  { slug: "schedule", navKey: "schedule" },
  { slug: "finance", navKey: "finance" },
  { slug: "reports", navKey: "reports" },
  { slug: "team", navKey: "team" },
  { slug: "map", navKey: "map" },
  { slug: "quotes", navKey: "quotes" },
  { slug: "billing", navKey: "billing" },
  { slug: "fiscal", navKey: "fiscal" },
  { slug: "referral", navKey: "referral" },
] as const

export type TabSlug = (typeof ALL_TABS)[number]["slug"]

// Tabs technician gets by default (admin can change this per-tenant)
export const DEFAULT_TECHNICIAN_TABS: TabSlug[] = ["dashboard", "service-orders", "schedule"]

// Abas que só existem se o plano incluir o recurso correspondente. Filtrar
// aqui esconde a aba do menu em um lugar só; a página e a rota de API de cada
// uma continuam se defendendo por conta própria (menu escondido não é
// proteção — a URL continua digitável).
const ABAS_POR_RECURSO: { slug: TabSlug; recurso: Recurso }[] = [
  { slug: "map", recurso: "gpsMap" },
  { slug: "fiscal", recurso: "nfse" },
]

export async function getAllowedTabs(tenantId: string, role: string): Promise<TabSlug[]> {
  const { recursos } = await getLimites(tenantId)
  const bloqueadas = new Set(
    ABAS_POR_RECURSO.filter((a) => !recursos.includes(a.recurso)).map((a) => a.slug)
  )

  if (role === "OWNER" || role === "ADMIN") {
    return ALL_TABS.map((t) => t.slug).filter((s) => !bloqueadas.has(s))
  }

  // TECHNICIAN: check TabPermission table; fall back to defaults
  const perms = await prisma.tabPermission.findMany({
    where: { tenantId, role: role as never },
    select: { tab: true },
  })

  const base = perms.length === 0 ? DEFAULT_TECHNICIAN_TABS : perms.map((p) => p.tab as TabSlug)
  return base.filter((s) => !bloqueadas.has(s))
}
