import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, ClipboardList, Users, AlertTriangle, Wrench } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDate, formatOsNumber, todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { getMonthlyRevenueChart } from "@/actions/dashboard"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { PainelPrimeirosPassos } from "@/components/dashboard/primeiros-passos"
import { getPrimeirosPassos } from "@/actions/primeiros-passos"
import { getTranslations } from "next-intl/server"

async function getDashboardData(tenantId: string) {
  const now = new Date()
  // Limite do mês em horário de Brasília, não no UTC do servidor da Vercel:
  // com `new Date(ano, mês, 1)` o mês começava às 21h do último dia do mês
  // anterior pro usuário brasileiro, e pagamentos daquela faixa apareciam no
  // mês errado. O gráfico já usava brtMidnightUTC; o card não.
  const { year, month } = todayInBRT()
  const startOfMonth = brtMidnightUTC(year, month, 1)

  const [
    monthlyRevenue,
    concludedNotInvoiced,
    openOrders,
    inProgressOrders,
    activeClients,
    overdueRevenues,
    recentOrders,
  ] = await Promise.all([
    prisma.revenue.aggregate({
      where: { tenantId, status: "PAID", paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    // Nem toda OS vira nota: muita empresa conclui o serviço, recebe na hora e
    // nunca fatura. Como Revenue só é criada na transição pra INVOICED, essas
    // OS ficavam valendo R$ 0 no dashboard — o dono via o mês inteiro de
    // trabalho sumir do card. (Relatado pelo usuário em 10/08/2026.)
    //
    // `revenues: { none: {} }` evita contar duas vezes caso exista uma receita
    // lançada à mão pra essa OS; quando ela é faturada, sai deste filtro
    // (status vira INVOICED) e entra pelo agregado de receitas acima.
    prisma.serviceOrder.aggregate({
      where: {
        tenantId,
        status: "DONE",
        concludedAt: { gte: startOfMonth },
        revenues: { none: {} },
      },
      _sum: { totalAmount: true },
    }),
    prisma.serviceOrder.count({ where: { tenantId, status: "OPEN" } }),
    prisma.serviceOrder.count({ where: { tenantId, status: "IN_PROGRESS" } }),
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
    paidRevenue: Number(monthlyRevenue._sum.amount ?? 0),
    concludedNotInvoiced: Number(concludedNotInvoiced._sum.totalAmount ?? 0),
    openOrders,
    inProgressOrders,
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
  const [data, chartData, passos] = await Promise.all([
    getDashboardData(tenantId),
    isAdmin ? getMonthlyRevenueChart() : Promise.resolve(null),
    // Só quem administra: o técnico não configura a empresa, e mostrar pra
    // ele uma lista que ele não pode cumprir é ruído puro.
    isAdmin ? getPrimeirosPassos() : Promise.resolve(null),
  ])

  const t = await getTranslations("dashboardHome")
  const tc = await getTranslations("common")

  // Os cartões de DINHEIRO só para quem administra.
  //
  // O gráfico logo abaixo já era escondido, com o comentário explicando que
  // financeiro é OWNER/ADMIN-only em todo o resto do sistema — e os cartões com
  // os MESMOS números ficaram visíveis para todo mundo. "dashboard" é aba
  // padrão de técnico, então todo técnico caía nesta tela no login e lia o
  // faturamento do mês da empresa. Os dois cartões ainda apontavam para
  // /finance, que redireciona o técnico de volta: o número aparecia e o clique
  // não levava a lugar nenhum. (Achado em auditoria, 20/08/2026 — o mesmo
  // vazamento que o gráfico corrigiu em 05/08, na metade que ficou para trás.)
  const stats = [
    ...(isAdmin
      ? [
          {
            title: t("stats.monthlyRevenue.title"),
            value: formatCurrency(data.paidRevenue + data.concludedNotInvoiced),
            icon: DollarSign,
            // Com as duas parcelas somadas num número só, o dono não teria como
            // saber de onde veio o valor. Quando há OS concluída sem faturar, o
            // rodapé mostra a composição em vez do texto genérico.
            description:
              data.concludedNotInvoiced > 0
                ? t("stats.monthlyRevenue.breakdown", {
                    paid: formatCurrency(data.paidRevenue),
                    concluded: formatCurrency(data.concludedNotInvoiced),
                  })
                : t("stats.monthlyRevenue.description"),
            href: "/finance",
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
        ]
      : []),
    {
      title: t("stats.openOrders.title"),
      value: String(data.openOrders + data.inProgressOrders),
      icon: ClipboardList,
      description: t("stats.openOrders.description", { open: data.openOrders, inProgress: data.inProgressOrders }),
      href: "/service-orders",
      alert: false,
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

      {/* Acima dos cartões de propósito: o dono precisa ver o que falta antes
          de ver os números zerados, senão lê "R$ 0" como defeito do sistema em
          vez de "ainda não configurei". */}
      {passos && <PainelPrimeirosPassos dados={passos} />}

      {/* A grade acompanha quantos cartões sobraram: com 2, quatro colunas
          deixariam metade da linha vazia. */}
      <div
        className={`grid gap-4 md:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}
      >
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
