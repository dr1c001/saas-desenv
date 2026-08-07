import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getReportData } from "@/actions/reports"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { PeriodPicker } from "@/components/reports/period-picker"

type SearchParams = Promise<{ from?: string; to?: string }>

function defaultDates() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  return { from, to }
}

// Ordem fixa de exibição no bloco "OS por Status" — os rótulos vêm de
// common.serviceOrderStatus pra não duplicar tradução.
const OS_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "INVOICED"]

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("finance")
  const tCommon = await getTranslations("common")
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const sp = await searchParams
  const { from: defFrom, to: defTo } = defaultDates()
  const from = sp.from ?? defFrom
  const to = sp.to ?? defTo

  const data = await getReportData(from, to)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("reports.title")}</h1>
        <Suspense>
          <PeriodPicker defaultFrom={from} defaultTo={to} />
        </Suspense>
      </div>

      {/* DRE */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.dre.title")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.revenueTitle")}</CardTitle>
              <TrendingUp className="size-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.dre.revenueCount", { count: data.revenues.length })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.expenseTitle")}</CardTitle>
              <TrendingDown className="size-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(data.totalExpense)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.dre.expenseCount", { count: data.expenses.length })}</p>
            </CardContent>
          </Card>
          <Card className={data.result >= 0 ? "border-green-200" : "border-red-200"}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.resultTitle")}</CardTitle>
              <DollarSign className={`size-4 ${data.result >= 0 ? "text-green-600" : "text-red-600"}`} />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.result >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(data.result)}
              </p>
              <p className="text-xs text-muted-foreground">{data.result >= 0 ? t("reports.dre.profitInPeriod") : t("reports.dre.lossInPeriod")}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* OS por status */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("reports.osByStatus.title")}</h2>
          <Card>
            <CardContent className="pt-4 space-y-2">
              {OS_STATUSES.map(status => {
                const count = data.osByStatus[status] ?? 0
                const total = Object.values(data.osByStatus).reduce((s, n) => s + n, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{tCommon(`serviceOrderStatus.${status}` as "serviceOrderStatus.OPEN")}</span>
                      <span className="font-medium">{count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {Object.keys(data.osByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("reports.osByStatus.empty")}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Top clientes */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("reports.topClients.title")}</h2>
          <Card>
            <CardContent className="p-0">
              {data.topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">{t("reports.topClients.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t("reports.topClients.columns.client")}</TableHead>
                      <TableHead className="text-right">{t("reports.topClients.columns.invoiced")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topClients.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{c.name}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Separator />

      {/* Detalhe receitas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.revenueDetail.title")}</h2>
        <Card>
          <CardContent className="p-0">
            {data.revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("reports.revenueDetail.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.revenueDetail.columns.description")}</TableHead>
                    <TableHead>{t("reports.revenueDetail.columns.order")}</TableHead>
                    <TableHead>{t("reports.revenueDetail.columns.paidAt")}</TableHead>
                    <TableHead className="text-right">{t("reports.revenueDetail.columns.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.revenues.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {r.order ? formatOsNumber(r.order.number, r.order.createdAt) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.paidAt ? formatDate(r.paidAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-700">
                        {formatCurrency(Number(r.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold text-sm">{t("reports.totalLabel")}</TableCell>
                    <TableCell className="text-right font-bold text-green-700">
                      {formatCurrency(data.totalRevenue)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Detalhe despesas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.expenseDetail.title")}</h2>
        <Card>
          <CardContent className="p-0">
            {data.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("reports.expenseDetail.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.expenseDetail.columns.description")}</TableHead>
                    <TableHead>{t("reports.expenseDetail.columns.category")}</TableHead>
                    <TableHead>{t("reports.expenseDetail.columns.paidAt")}</TableHead>
                    <TableHead className="text-right">{t("reports.expenseDetail.columns.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t(`expenseCategory.${e.category}` as "expenseCategory.FIXED")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.paidAt ? formatDate(e.paidAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-700">
                        {formatCurrency(Number(e.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold text-sm">{t("reports.totalLabel")}</TableCell>
                    <TableCell className="text-right font-bold text-red-700">
                      {formatCurrency(data.totalExpense)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
