import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getLimites, temRecurso } from "@/lib/plan"
import { ALL_TABS, ABAS_POR_RECURSO, type TabSlug } from "@/lib/abas"
import { ACOES, acoesValendo, ehAcao, podeFazer, type Acao } from "@/lib/acoes"
import { escopoDe, filtroDeFilial, type Escopo } from "@/lib/filial"
import { tenantImpersonado, isSuperAdmin } from "@/lib/admin"
import { PAST_DUE_GRACE_DAYS } from "@/lib/past-due"
import { fimDoTeste, testeAtivo } from "@/lib/teste-gratis"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { sendWelcomeEmail } from "@/lib/resend"
import { avisarPlataforma } from "@/lib/avisar-plataforma"
import { Prisma } from "@/generated/prisma/client"
import { getTranslations } from "next-intl/server"
import { abasPadraoDe, ehAdministrativo } from "@/lib/cargos"

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
        select: { id: true, tenantId: true, role: true, branchId: true, tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } } },
      })) ??
      // Empresa sem OWNER é anomalia, mas não pode impedir o suporte de olhar.
      (await prisma.user.findFirst({
        where: { tenantId: alvoImpersonado },
        select: { id: true, tenantId: true, role: true, branchId: true, tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } } },
      }))

    // Sem nenhum usuário, não há o que ver — segue para a conta real em vez de
    // deixar o admin numa tela quebrada.
    if (anfitriao) {
      return {
        userId: anfitriao.id,
        tenantId: anfitriao.tenantId,
        role: anfitriao.role,
        // A filial de quem está sendo visitado, para o suporte enxergar a tela
        // que a pessoa enxerga.
        branchId: anfitriao.branchId,
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
      branchId: true,
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
    // Funcionário da plataforma (financeiro, comercial, logística, TI) não
    // pertence a empresa nenhuma. Sem esta guarda, o primeiro acesso dele ao
    // /dashboard cairia aqui e criaria uma EMPRESA FANTASMA no nome dele — que
    // apareceria na lista de clientes do painel, contaria nos gráficos de
    // crescimento e entraria no relatório em PDF.
    //
    // Fica só nesta branch, a única que cria tenant: quem já tem User row
    // (dono ou técnico de empresa cliente) nem chega aqui, então o caminho
    // normal segue sem custo nenhum.
    if (await isSuperAdmin()) redirect("/admin")

    const te = await getTranslations("errors")
    const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? te("defaultUserName")
    const companyName = user.user_metadata?.company_name ?? te("defaultCompanyName", { name })
    const refCode: string | undefined = user.user_metadata?.ref_code

    let referralDiscountPercent = 0
    if (refCode) {
      const referrer = await prisma.tenant.findFirst({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer) referralDiscountPercent = NEW_SIGNUP_DISCOUNT_PERCENT
    }

    // O teste grátis de 15 dias, de volta em 08/09/2026. O tenant nasce em
    // TRIAL (padrão do schema) com a data de fim carimbada aqui — o campo
    // existia e ninguém o preenchia desde que o trial foi removido em julho.
    const tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        referredByCode: refCode ?? null,
        referralDiscountPercent,
        trialEndsAt: fimDoTeste(new Date()),
      },
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
          branchId: true,
          tenant: { select: { subscriptionStatus: true, trialEndsAt: true, locale: true } },
        },
      })
      return {
        userId: user.id,
        tenantId: winner.tenantId,
        role: winner.role,
        branchId: winner.branchId,
        tenantStatus: winner.tenant,
        locale: winner.tenant.locale,
      }
    }

    // ─── Avisa o dono da plataforma ─────────────────────────────────────────
    //
    // AQUI, e não junto do `tenant.create` acima: naquele ponto o cadastro
    // ainda pode ser desfeito. Os dois ramos do `catch` apagam o tenant recém
    // criado — o da corrida entre requisições e o do e-mail duplicado —, e
    // avisar de lá anunciaria empresas que deixaram de existir milissegundos
    // depois. Este é o único caminho em que o tenant sobreviveu E o User foi
    // criado.
    //
    // `after` para não segurar o primeiro login por causa de uma notificação, e
    // `avisarPlataforma` nunca lança: cadastro não pode falhar por push.
    after(avisarPlataforma("novaEmpresa", { tenantId, empresa: companyName }))

    // Empresa recém-criada não tem filial nenhuma ainda.
    return { userId: user.id, tenantId, role, branchId: null, tenantStatus, locale: tenant.locale }
  }

  return {
    userId: user.id,
    tenantId: dbUser.tenantId,
    role: dbUser.role,
    branchId: dbUser.branchId,
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
    select: { subscriptionStatus: true, trialEndsAt: true },
  })
  if (tenant?.subscriptionStatus === "ACTIVE") return true

  // O teste grátis. `trialEndsAt` nulo NÃO dá acesso: é o estado das empresas
  // criadas enquanto não havia trial, e liberá-las agora reabriria o sistema de
  // graça para quem parou de pagar.
  if (tenant?.subscriptionStatus === "TRIAL") {
    return testeAtivo(tenant.trialEndsAt, new Date())
  }

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

// Catálogo das abas em lib/abas.ts, que é puro — componente de cliente precisa
// da lista e não pode arrastar o Prisma junto. Reexportado pra não quebrar quem
// já importava daqui.
export { ALL_TABS, ABAS_POR_RECURSO } from "./abas"
export type { TabSlug } from "./abas"

// Tabs technician gets by default (admin can change this per-tenant)
/** @deprecated Use `abasPadraoDe(cargo)`. Mantido porque o valor do técnico não
 *  pode mudar: toda empresa que já restringiu seus técnicos depende dele. */
export const DEFAULT_TECHNICIAN_TABS: TabSlug[] = ["dashboard", "service-orders", "schedule"]

export async function getAllowedTabs(tenantId: string, role: string): Promise<TabSlug[]> {
  const { recursos } = await getLimites(tenantId)
  const bloqueadas = new Set(
    ABAS_POR_RECURSO.filter((a) => !recursos.includes(a.recurso)).map((a) => a.slug)
  )

  if (ehAdministrativo(role)) {
    return ALL_TABS.map((t) => t.slug).filter((s) => !bloqueadas.has(s))
  }

  const [perms, tenant] = await Promise.all([
    prisma.tabPermission.findMany({
      where: { tenantId, role: role as never },
      select: { tab: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tabsConfiguredRoles: true },
    }),
  ])

  // Cai no padrão só quando a empresa NUNCA mexeu NESTE cargo. Antes a condição
  // era apenas `perms.length === 0`, e aí desmarcar as 19 abas na tela gravava
  // zero linhas — que eram lidas como "usar o padrão" e concediam 3 abas de
  // volta. A tela prometia acesso nenhum e o código dava três.
  //
  // E é POR CARGO desde que passaram a existir vários: com um marcador único da
  // empresa, configurar o técnico faria o financeiro ler "já configuraram" com
  // zero linhas gravadas, e abrir o sistema com menu vazio.
  const nuncaConfigurou =
    !(tenant?.tabsConfiguredRoles ?? []).includes(role) && perms.length === 0
  const base = nuncaConfigurou ? abasPadraoDe(role) : perms.map((p) => p.tab as TabSlug)
  return base.filter((s) => !bloqueadas.has(s))
}

/**
 * As ações que este papel pode executar nesta empresa.
 *
 * OWNER/ADMIN não consultam nada: `podeFazer` já os libera, e ir ao banco só
 * para confirmar o óbvio custaria uma consulta em todo clique do dono.
 */
export async function getAcoesPermitidas(tenantId: string, role: string): Promise<readonly Acao[]> {
  if (ehAdministrativo(role)) return ACOES

  const [perms, tenant] = await Promise.all([
    prisma.actionPermission.findMany({
      where: { tenantId, role: role as never },
      select: { action: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { actionsConfiguredRoles: true },
    }),
  ])

  return acoesValendo(
    (tenant?.actionsConfiguredRoles ?? []).includes(role),
    perms.map((p) => p.action).filter(ehAcao)
  )
}

/**
 * O escopo de filial de quem está pedindo, já contando o plano.
 *
 * Ponto único: toda consulta escopada passa por aqui. Se cada uma montasse o
 * próprio filtro, bastaria uma esquecer para vazar dado de outra unidade — e
 * vazamento de escopo não dá erro, mostra a tela errada calada.
 *
 * `escolhida` é o filtro que o dono aplica na tela, e `escopoDe` decide se ele
 * vale: para quem está preso a uma filial, não vale.
 */
export async function escopoAtual(escolhida?: string | null): Promise<Escopo> {
  const { tenantId, role, branchId } = await getTenant()
  return escopoDe(
    { role, branchId, temFiliais: await temRecurso(tenantId, "filiais") },
    escolhida
  )
}

/** O filtro pronto para espalhar no `where` de uma consulta. */
export async function filtroDeFilialAtual(escolhida?: string | null) {
  return filtroDeFilial(await escopoAtual(escolhida))
}

/**
 * Barra a ação quando o papel não pode.
 *
 * Devolve `null` quando pode, e o código do erro quando não — em vez de lançar.
 * As Actions daqui já respondem com `{ erro: "semPermissao" }` ou `{ message }`,
 * e cada uma sabe o formato que a tela dela espera; lançar transformaria uma
 * recusa prevista em tela de erro genérica.
 */
export async function checarAcao(acao: Acao): Promise<"semPermissao" | null> {
  const { tenantId, role } = await getTenant()
  const permitidas = await getAcoesPermitidas(tenantId, role)
  return podeFazer(role, permitidas, acao) ? null : "semPermissao"
}
