import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, ClipboardList, Users, TrendingUp } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDate } from "@/lib/utils"

async function getDashboardData(tenantId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [monthlyRevenue, openOrders, doneOrders, activeClients, recentOrders] =
    await Promise.all([
      prisma.revenue.aggregate({
        where: { tenantId, status: "PAID", paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.serviceOrder.count({ where: { tenantId, status: "OPEN" } }),
      prisma.serviceOrder.count({
        where: { tenantId, status: "DONE", concludedAt: { gte: startOfMonth } },
      }),
      prisma.client.count({ where: { tenantId, status: "ACTIVE" } }),
      prisma.serviceOrder.findMany({
        where: { tenantId },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ])

  return {
    monthlyRevenue: Number(monthlyRevenue._sum.amount ?? 0),
    openOrders,
    doneOrders,
    activeClients,
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
  const { tenantId } = await getTenant()
  const data = await getDashboardData(tenantId)

  const stats = [
    {
      title: "Faturado no mês",
      value: formatCurrency(data.monthlyRevenue),
      icon: DollarSign,
      description: "Receitas pagas este mês",
    },
    {
      title: "OS Abertas",
      value: String(data.openOrders),
      icon: ClipboardList,
      description: "Aguardando execução",
    },
    {
      title: "OS Concluídas",
      value: String(data.doneOrders),
      icon: TrendingUp,
      description: "Este mês",
    },
    {
      title: "Clientes Ativos",
      value: String(data.activeClients),
      icon: Users,
      description: "Total de clientes ativos",
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OS Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma OS criada ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.recentOrders.map((os) => (
                <Link
                  key={os.id}
                  href={`/service-orders/${os.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">OS #{os.number} — {os.title}</p>
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
