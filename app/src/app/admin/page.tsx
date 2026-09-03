import { prisma } from "@/lib/prisma"
import { getTranslations } from "next-intl/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { requireSuperAdmin, permissoesDe, papelPode } from "@/lib/admin"
import { ehRecurso, limitesDoPlano, recursosDoPlano } from "@/lib/plan"
import { AdminTeam, NOME_AREA, type MembroEquipe } from "@/components/admin/admin-team"
import { calcularRetratoAtual, chaveMesBRT, valorMensal } from "@/lib/snapshot"
import { TenantActions } from "@/components/admin/tenant-actions"
import {
  GraficoCrescimento,
  GraficoMrr,
  GraficoUsuarios,
  type PontoCrescimento,
  type PontoUsuarios,
} from "@/components/admin/admin-charts"
import { Users, Building2, TrendingUp, AlertCircle, CheckCircle2, Clock, CreditCard, UserCheck, Search, FileDown } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { TestarAviso } from "@/components/admin/testar-aviso"

type SubscriptionStatusKey = "TRIAL" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"

const STATUS_VARIANT: Record<SubscriptionStatusKey, "default" | "secondary" | "destructive" | "outline"> = {
  TRIAL:     "secondary",
  PENDING:   "secondary",
  ACTIVE:    "default",
  PAST_DUE:  "destructive",
  CANCELLED: "outline",
}

/** 'AAAA-MM' → "ago/26". */
function rotuloDoMes(chave: string) {
  const [ano, mes] = chave.split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
}

type SearchParams = Promise<{ q?: string }>

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  // A checagem do layout não protege esta página se alguém a alcançar por
  // outro caminho — e custa uma linha repetir.
  const admin = await requireSuperAdmin()
  const t = await getTranslations("mapAdmin")
  const { q } = await searchParams
  const busca = q?.trim()

  const [tenants, planos, retratos, retratoAtual, ultimasAcoes] = await Promise.all([
    prisma.tenant.findMany({
      where: busca
        ? {
            OR: [
              { name: { contains: busca, mode: "insensitive" } },
              { document: { contains: busca, mode: "insensitive" } },
              // Pelo ID também: é assim que o toque na notificação cai na
              // linha exata da empresa (/admin?q=<tenantId>). Sem isto o deep
              // link do aviso abriria a lista inteira, e achar a empresa à mão
              // é justamente o trabalho que o aviso existe para poupar.
              { id: busca },
            ],
          }
        : undefined,
      include: {
        plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceYearly: true } },
        users: { select: { id: true, role: true } },
        _count: { select: { orders: true, clients: true, quotes: true } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { billingCycle: true, currentPeriodEnd: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { priceMonthly: "asc" }, select: { id: true, name: true } }),
    // Histórico vem da tabela de retrato, não de reconstrução. Só aparecem os
    // meses que de fato foram fotografados — nada de inventar passado.
    prisma.monthlySnapshot.findMany({ orderBy: { month: "asc" }, take: 12 }),
    // O mês corrente é calculado ao vivo, pra estar certo mesmo antes de o
    // cron do dia rodar.
    calcularRetratoAtual(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ])

  const permissoes = permissoesDe(admin.role)
  const veFinanceiro = papelPode(admin.role, "verFinanceiro")
  // A equipe só é carregada pra quem administra a equipe.
  const equipe: MembroEquipe[] = papelPode(admin.role, "gerenciarEquipe")
    ? ((await prisma.platformAdmin.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] })) as MembroEquipe[])
    : []

  // Os cartões mostram o retrato do negócio INTEIRO, não a lista filtrada pela
  // busca — senão pesquisar uma empresa mudaria o MRR na tela.
  const stats = retratoAtual

  // ── Séries dos gráficos ──────────────────────────────────────────────────
  // Só meses que foram de fato fotografados, mais o mês corrente ao vivo. Nada
  // de reconstruir passado: até 10/08/2026 os gráficos deduziam o histórico das
  // datas de assinatura, o que apagava períodos de inadimplência (uma empresa
  // que ficou 2 meses sem pagar e voltou aparecia como pagante o tempo todo).
  // Com poucos meses gravados o gráfico é curto — e isso é honesto.
  const mesAtual = chaveMesBRT(new Date())
  const serie = [
    ...retratos.filter((r) => r.month !== mesAtual),
    { month: mesAtual, ...retratoAtual },
  ]

  const crescimento: PontoCrescimento[] = serie.map((r) => ({
    mes: rotuloDoMes(r.month),
    empresas: r.companies,
    pagantes: r.activeCompanies,
    mrr: Number(r.mrr),
  }))

  const serieUsuarios: PontoUsuarios[] = serie.map((r) => ({
    mes: rotuloDoMes(r.month),
    usuarios: r.users,
    pagantes: r.payingUsers,
  }))

  const cartoes = [
    { key: "companies", icon: Building2, valor: String(stats.companies), cor: "" },
    { key: "active", icon: CheckCircle2, valor: String(stats.activeCompanies), cor: "text-green-600", borda: "border-green-200 dark:border-green-800" },
    { key: "pending", icon: CreditCard, valor: String(stats.pendingCompanies), cor: "text-orange-600", borda: "border-orange-200 dark:border-orange-800" },
    // "Sem assinatura" (TRIAL) sai por subtração em vez de virar mais uma
    // coluna no retrato: os cinco status são exaustivos, então o resto é
    // exatamente ele — e uma coluna a menos é uma coluna a menos pra
    // dessincronizar.
    { key: "noSubscription", icon: Clock, cor: "text-yellow-600", borda: "border-yellow-200 dark:border-yellow-800",
      valor: String(
        stats.companies - stats.activeCompanies - stats.pendingCompanies - stats.pastDueCompanies - stats.cancelledCompanies
      ) },
    { key: "pastDue", icon: AlertCircle, valor: String(stats.pastDueCompanies), cor: "text-red-600", borda: "border-red-200 dark:border-red-800" },
    { key: "mrr", icon: TrendingUp, valor: formatCurrency(stats.mrr), cor: "text-purple-600", borda: "border-purple-200 dark:border-purple-800" },
    { key: "users", icon: Users, valor: String(stats.users), cor: "" },
    { key: "payingUsers", icon: UserCheck, valor: String(stats.payingUsers), cor: "text-green-600" },
  ] as const

  // Logística e TI não veem faturamento: o cartão de MRR e os gráficos de
  // dinheiro simplesmente não existem pra eles. Não é só esconder na tela —
  // o relatório em PDF também exige a permissão, na própria rota.
  const cartoesVisiveis = cartoes.filter((c) => veFinanceiro || c.key !== "mrr")

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Quem sou eu e o que posso */}
      <p className="text-xs text-muted-foreground">
        {admin.name} · {NOME_AREA[admin.role]}
      </p>

      {/* Cartões */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        {cartoesVisiveis.map((c) => (
          <Card key={c.key} className={"borda" in c ? (c.borda as string) : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <c.icon className={`size-3.5 ${c.cor}`} />
                {t(`admin.stats.${c.key}` as "admin.stats.companies")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${c.cor}`}>{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerta: PENDING é quem pagou e pode estar sem acesso. Foi exatamente
          o caso de 07/08/2026, e o painel antigo não mostrava esse estado. */}
      {stats.pendingCompanies > 0 && (
        <div className="rounded-lg border border-orange-400/50 bg-orange-50 dark:bg-orange-950/40 px-4 py-3 text-sm text-orange-900 dark:text-orange-100">
          {t("admin.pendingWarning", { count: stats.pendingCompanies })}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("admin.charts.growthTitle")}</CardTitle></CardHeader>
          <CardContent><GraficoCrescimento dados={crescimento} /></CardContent>
        </Card>
        {veFinanceiro && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("admin.charts.mrrTitle")}</CardTitle></CardHeader>
            <CardContent><GraficoMrr dados={crescimento} /></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">{t("admin.charts.usersTitle")}</CardTitle></CardHeader>
          <CardContent><GraficoUsuarios dados={serieUsuarios} /></CardContent>
        </Card>
      </div>

      {/* Tabela de tenants */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            {busca
              ? t("admin.table.searchResults", { count: tenants.length, term: busca })
              : t("admin.table.title", { count: tenants.length })}
          </CardTitle>
          {/* Busca por GET: o termo fica na URL, então dá pra recarregar,
              favoritar e mandar o link pra alguém da equipe já filtrado. */}
          <form method="GET" className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                name="q"
                defaultValue={busca ?? ""}
                placeholder={t("admin.table.searchPlaceholder")}
                className="w-56 rounded-md border bg-background px-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("admin.table.searchButton")}
            </button>
            {papelPode(admin.role, "gerarRelatorio") && (
            <a
              href={`/api/pdf/admin-report${busca ? `?q=${encodeURIComponent(busca)}` : ""}`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileDown className="size-3.5 mr-1.5" />
              {t("admin.table.pdfButton")}
            </a>
            )}
            {/* Prova que o aviso no celular está de pé. O modo de falha deste
                recurso é o silêncio — sem um botão, o cano pode estar quebrado
                há meses e ninguém saber. */}
            <TestarAviso />
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{t("admin.table.columns.company")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("admin.table.columns.status")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("admin.table.columns.plan")}</th>
                  <th className="text-center px-4 py-3 font-medium">{t("admin.table.columns.users")}</th>
                  <th className="text-center px-4 py-3 font-medium">{t("admin.table.columns.orders")}</th>
                  <th className="text-center px-4 py-3 font-medium">{t("admin.table.columns.clients")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("admin.table.columns.renews")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("admin.table.columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant, i) => {
                  const statusKey: SubscriptionStatusKey = tenant.subscriptionStatus in STATUS_VARIANT
                    ? tenant.subscriptionStatus
                    : "TRIAL"
                  const sub = tenant.subscriptions[0]
                  const dateLabel = sub?.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")
                    : "—"

                  return (
                    <tr key={tenant.id} className={`border-b hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tenant.document ?? t("admin.table.noDocument")} · {new Date(tenant.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[statusKey]}>{t(`admin.subscriptionStatus.${statusKey}`)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {tenant.plan ? (
                          <div>
                            <p className="font-medium">{tenant.plan.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(valorMensal(sub?.billingCycle, tenant.plan))}{t("admin.table.perMonth")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("admin.table.noPlan")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{tenant.users.length}</td>
                      <td className="px-4 py-3 text-center">{tenant._count.orders}</td>
                      <td className="px-4 py-3 text-center">{tenant._count.clients}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <TenantActions
                          tenantId={tenant.id}
                          tenantName={tenant.name}
                          status={tenant.subscriptionStatus}
                          planId={tenant.planId}
                          planos={planos}
                          recursosDoPlano={recursosDoPlano(tenant.plan?.slug)}
                          recursosExtras={tenant.extraFeatures.filter(ehRecurso)}
                          limitesDoPlano={limitesDoPlano(tenant.plan?.slug)}
                          funcoesDesligadas={tenant.disabledFeatures}
                          ajustes={{
                            usuarios: tenant.maxUsersOverride,
                            osMes: tenant.maxOrdersOverride,
                            nfseMes: tenant.maxNfseOverride,
                            precoMensal:
                              tenant.customPriceMonthly === null
                                ? null
                                : Number(tenant.customPriceMonthly),
                          }}
                          permissoes={permissoes}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">{t("admin.table.empty")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {equipe.length > 0 || papelPode(admin.role, "gerenciarEquipe") ? (
        <AdminTeam membros={equipe} />
      ) : null}

      {/* Auditoria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.audit.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {ultimasAcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.audit.empty")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {ultimasAcoes.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="font-mono text-xs">{new Date(a.createdAt).toLocaleString("pt-BR")}</span>
                  <span className="font-medium text-foreground">{t(`admin.audit.action.${a.action}` as "admin.audit.action.liberar_acesso")}</span>
                  {a.detail && <span>— {a.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
