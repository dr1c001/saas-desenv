import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, ClipboardList, Users, TrendingUp, AlertTriangle, Wrench } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"
import { getMonthlyRevenueChart } from "@/actions/dashboard"
import { RevenueChart } from "@/components/dashboard/revenue-chart"

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

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OPEN: { label: "Aberta", variant: "secondary" },
  IN_PROGRESS: { label: "Em andamento", variant: "default" },
  DONE: { label: "Concluída", variant: "outline" },
  INVOICED: { label: "Faturada", variant: "outline" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
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

  const stats = [
    {
      title: "Faturado no mês",
      value: formatCurrency(data.monthlyRevenue),
      icon: DollarSign,
      description: "Receitas pagas este mês",
      href: "/finance",
      alert: false,
    },
    {
      title: "OS em Aberto",
      value: String(data.openOrders + data.inProgressOrders),
      icon: ClipboardList,
      description: `${data.openOrders} abertas · ${data.inProgressOrders} em andamento`,
      href: "/service-orders",
      alert: false,
    },
    {
      title: "Recebimentos Vencidos",
      value: String(data.overdueRevenues),
      icon: AlertTriangle,
      description: "Receitas pendentes vencidas",
      href: "/finance",
      alert: data.overdueRevenues > 0,
    },
    {
      title: "Clientes Ativos",
      value: String(data.activeClients),
      icon: Users,
      description: "Total de clientes ativos",
      href: "/clients",
      alert: false,
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

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
              <CardTitle className="text-base">Receita × Despesa (últimos 6 meses)</CardTitle>
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
            OS Ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma OS ativa no momento.</p>
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
                    <Badge variant={statusConfig[os.status].variant}>
                      {statusConfig[os.status].label}
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
