import { prisma } from "@/lib/prisma"
import { getTranslations } from "next-intl/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { requireSuperAdmin } from "@/lib/admin"
import { TenantActions } from "@/components/admin/tenant-actions"
import {
  GraficoCrescimento,
  GraficoMrr,
  GraficoUsuarios,
  type PontoCrescimento,
  type PontoUsuarios,
} from "@/components/admin/admin-charts"
import { Users, Building2, TrendingUp, AlertCircle, CheckCircle2, Clock, CreditCard, UserCheck } from "lucide-react"

type SubscriptionStatusKey = "TRIAL" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"

const STATUS_VARIANT: Record<SubscriptionStatusKey, "default" | "secondary" | "destructive" | "outline"> = {
  TRIAL:     "secondary",
  PENDING:   "secondary",
  ACTIVE:    "default",
  PAST_DUE:  "destructive",
  CANCELLED: "outline",
}

/** Chave 'AAAA-MM' de uma data, no fuso de Brasília (mesma convenção do
 *  gráfico do dashboard — ver actions/dashboard.ts). */
function chaveMes(d: Date) {
  const brt = new Date(d.getTime() - 3 * 3600_000)
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Últimos 12 meses, do mais antigo pro mais recente. */
function ultimosMeses(n = 12) {
  const agora = new Date()
  const meses: { chave: string; rotulo: string; fim: Date }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1))
    meses.push({
      chave: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      rotulo: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
      // Início do mês seguinte: usado pra saber quem já era cliente até ali.
      fim: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
    })
  }
  return meses
}

export default async function AdminPage() {
  // A checagem do layout não protege esta página se alguém a alcançar por
  // outro caminho — e custa uma linha repetir.
  await requireSuperAdmin()
  const t = await getTranslations("mapAdmin")

  const [tenants, planos, usuarios, assinaturas, ultimasAcoes] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        plan: { select: { id: true, name: true, priceMonthly: true, priceYearly: true } },
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
    prisma.user.findMany({ select: { createdAt: true, tenantId: true } }),
    prisma.subscription.findMany({
      select: {
        createdAt: true,
        cancelledAt: true,
        status: true,
        billingCycle: true,
        tenantId: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
      },
    }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ])

  /** Quanto uma assinatura vale POR MÊS. O plano anual custa priceYearly pelo
   *  ano inteiro, então dividir por 12 é o que dá o valor mensal — antes o
   *  código tinha um ternário que devolvia priceMonthly nos dois casos, o que
   *  inflava o MRR em 20% assim que alguém assinasse o anual. */
  const mensalDe = (
    ciclo: string | null | undefined,
    plano: { priceMonthly: unknown; priceYearly: unknown } | null
  ) => {
    if (!plano) return 0
    return ciclo === "YEARLY" ? Number(plano.priceYearly) / 12 : Number(plano.priceMonthly)
  }

  const porStatus = (s: SubscriptionStatusKey) =>
    tenants.filter((tenant) => tenant.subscriptionStatus === s).length

  const idsPagantes = new Set(
    tenants.filter((tenant) => tenant.subscriptionStatus === "ACTIVE").map((tenant) => tenant.id)
  )

  const stats = {
    total: tenants.length,
    active: porStatus("ACTIVE"),
    pending: porStatus("PENDING"),
    trial: porStatus("TRIAL"),
    pastDue: porStatus("PAST_DUE"),
    mrr: tenants
      .filter((tenant) => tenant.subscriptionStatus === "ACTIVE")
      .reduce((soma, tenant) => soma + mensalDe(tenant.subscriptions[0]?.billingCycle, tenant.plan), 0),
    usuarios: usuarios.length,
    usuariosPagantes: usuarios.filter((u) => idsPagantes.has(u.tenantId)).length,
  }

  // ── Séries dos gráficos ──────────────────────────────────────────────────
  const meses = ultimosMeses(12)

  const novasPorMes = new Map<string, number>()
  for (const tenant of tenants) {
    const k = chaveMes(tenant.createdAt)
    novasPorMes.set(k, (novasPorMes.get(k) ?? 0) + 1)
  }

  const novosUsuariosPorMes = new Map<string, number>()
  for (const u of usuarios) {
    const k = chaveMes(u.createdAt)
    novosUsuariosPorMes.set(k, (novosUsuariosPorMes.get(k) ?? 0) + 1)
  }

  // Quem estava pagando em cada mês: assinatura criada até o fim daquele mês e
  // ainda não cancelada naquele momento. É reconstrução a partir das datas —
  // não há histórico de status guardado, então o passado é aproximação; o mês
  // corrente é exato.
  const crescimento: PontoCrescimento[] = meses.map(({ chave, rotulo, fim }) => {
    const vigentes = assinaturas.filter(
      (s) => s.createdAt < fim && s.status !== "PENDING" && (!s.cancelledAt || s.cancelledAt >= fim)
    )
    return {
      mes: rotulo,
      novasEmpresas: novasPorMes.get(chave) ?? 0,
      pagantes: new Set(vigentes.map((s) => s.tenantId)).size,
      mrr: vigentes.reduce((soma, s) => soma + mensalDe(s.billingCycle, s.plan), 0),
    }
  })

  const serieUsuarios: PontoUsuarios[] = meses.map(({ chave, rotulo, fim }) => ({
    mes: rotulo,
    novos: novosUsuariosPorMes.get(chave) ?? 0,
    // Contar quem já existia até o fim do mês, em vez de ir somando numa
    // variável de fora do map: além de manter a função pura (o compilador do
    // React recusa reatribuição depois do render), corrige o número — somando
    // só os 12 meses da série, quem entrou antes disso ficava de fora do total.
    acumulado: usuarios.filter((u) => u.createdAt < fim).length,
  }))

  const cartoes = [
    { key: "companies", icon: Building2, valor: String(stats.total), cor: "" },
    { key: "active", icon: CheckCircle2, valor: String(stats.active), cor: "text-green-600", borda: "border-green-200 dark:border-green-800" },
    { key: "pending", icon: CreditCard, valor: String(stats.pending), cor: "text-orange-600", borda: "border-orange-200 dark:border-orange-800" },
    { key: "noSubscription", icon: Clock, valor: String(stats.trial), cor: "text-yellow-600", borda: "border-yellow-200 dark:border-yellow-800" },
    { key: "pastDue", icon: AlertCircle, valor: String(stats.pastDue), cor: "text-red-600", borda: "border-red-200 dark:border-red-800" },
    { key: "mrr", icon: TrendingUp, valor: formatCurrency(stats.mrr), cor: "text-purple-600", borda: "border-purple-200 dark:border-purple-800" },
    { key: "users", icon: Users, valor: String(stats.usuarios), cor: "" },
    { key: "payingUsers", icon: UserCheck, valor: String(stats.usuariosPagantes), cor: "text-green-600" },
  ] as const

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Cartões */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        {cartoes.map((c) => (
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
      {stats.pending > 0 && (
        <div className="rounded-lg border border-orange-400/50 bg-orange-50 dark:bg-orange-950/40 px-4 py-3 text-sm text-orange-900 dark:text-orange-100">
          {t("admin.pendingWarning", { count: stats.pending })}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("admin.charts.growthTitle")}</CardTitle></CardHeader>
          <CardContent><GraficoCrescimento dados={crescimento} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("admin.charts.mrrTitle")}</CardTitle></CardHeader>
          <CardContent><GraficoMrr dados={crescimento} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("admin.charts.usersTitle")}</CardTitle></CardHeader>
          <CardContent><GraficoUsuarios dados={serieUsuarios} /></CardContent>
        </Card>
      </div>

      {/* Tabela de tenants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            {t("admin.table.title", { count: tenants.length })}
          </CardTitle>
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
                              {formatCurrency(mensalDe(sub?.billingCycle, tenant.plan))}{t("admin.table.perMonth")}
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
