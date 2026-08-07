import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, ClipboardList, Users, TrendingUp, AlertTriangle, Wrench } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"
import { getMonthlyRevenueChart } from "@/actions/dashboard"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { getTranslations } from "next-intl/server"

async function getDashboardData(tenantId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    monthlyRevenue,
    openOrders,
    inProgressOrders,
    doneOrders,
    activeClients,
    overdueRevenues,
    recentOrders,
  ] = await Promise.all([
    prisma.revenue.aggregate({
      where: { tenantId, status: "PAID", paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.serviceOrder.count({ where: { tenantId, status: "OPEN" } }),
    prisma.serviceOrder.count({ where: { tenantId, status: "IN_PROGRESS" } }),
    prisma.serviceOrder.count({
      where: { tenantId, status: "DONE", concludedAt: { gte: startOfMonth } },
    }),
    prisma.client.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.revenue.count({
      where: { tenantId, status: "PENDING", dueDate: { lt: now } },
    }),
    prisma.serviceOrder.findMany({
      where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ])

  return {
    monthlyRevenue: Number(monthlyRevenue._sum.amount ?? 0),
    openOrders,
    inProgressOrders,
    doneOrders,
    activeClients,
    overdueRevenues,
    recentOrders,
  }
}

// Rótulos vêm de common.serviceOrderStatus (i18n); aqui só a variante visual do Badge por status.
const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "secondary",
  IN_PROGRESS: "default",
  DONE: "outline",
  INVOICED: "outline",
  CANCELLED: "destructive",
}

export default async function DashboardPage() {
  const { tenantId, role } = await getTenant()
  // Gráfico mostra receita/despesa reais — financeiro é OWNER/ADMIN-only em
  // todo o resto do sistema (finance.ts, reports.ts), a Action já se
  // recusa a rodar pra TECHNICIAN. (Achado em auditoria pré-venda, 2026-08-05.)
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const [data, chartData] = await Promise.all([
    getDashboardData(tenantId),
    isAdmin ? getMonthlyRevenueChart() : Promise.resolve(null),
  ])

  const t = await getTranslations("dashboardHome")
  const tc = await getTranslations("common")

  const stats = [
    {
      title: t("stats.monthlyRevenue.title"),
      value: formatCurrency(data.monthlyRevenue),
      icon: DollarSign,
      description: t("stats.monthlyRevenue.description"),
      href: "/finance",
      alert: false,
    },
    {
      title: t("stats.openOrders.title"),
      value: String(data.openOrders + data.inProgressOrders),
      icon: ClipboardList,
      description: t("stats.openOrders.description", { open: data.openOrders, inProgress: data.inProgressOrders }),
      href: "/service-orders",
      alert: false,
    },
    {
      title: t("stats.overdueRevenues.title"),
      value: String(data.overdueRevenues),
      icon: AlertTriangle,
      description: t("stats.overdueRevenues.description"),
      href: "/finance",
      alert: data.overdueRevenues > 0,
    },
    {
      title: t("stats.activeClients.title"),
      value: String(data.activeClients),
      icon: Users,
      description: t("stats.activeClients.description"),
      href: "/clients",
      alert: false,
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className={`transition-colors hover:bg-muted/50 ${stat.alert ? "border-destructive/60" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`size-4 ${stat.alert ? "text-destructive" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.alert ? "text-destructive" : ""}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {chartData && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("chart.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart data={chartData} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="size-4" />
            {t("activeOrders.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("activeOrders.empty")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentOrders.map((os) => (
                <Link
                  key={os.id}
                  href={`/service-orders/${os.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{formatOsNumber(os.number, os.createdAt)} — {os.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {os.client.name} · {formatDate(os.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(Number(os.totalAmount))}</span>
                    <Badge variant={statusVariant[os.status]}>
                      {tc(`serviceOrderStatus.${os.status}` as "serviceOrderStatus.OPEN")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
