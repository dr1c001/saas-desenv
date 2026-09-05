import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getFinanceSummary } from "@/actions/finance"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { ExpenseDialog } from "@/components/finance/expense-dialog"
import { BaseDaComissao } from "@/components/finance/base-comissao"
import { PayButton } from "@/components/finance/pay-button"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { filiaisAtivas } from "@/actions/filiais"

type SearchParams = Promise<{ q?: string; filial?: string }>

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const { q, filial } = await searchParams
  const t = await getTranslations("finance")
  const tFil = await getTranslations("filiais.filtro")
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  // Cada unidade fecha o mês dela. O que não tem filial (despesa da empresa)
  // entra em todas — ver lib/filial.ts.
  const [{ revenues, expenses, monthlyRevenue, pendingRevenues, pendingExpenses, comissoes, baseDaComissao }, filiais] =
    await Promise.all([getFinanceSummary(q, filial), filiaisAtivas()])

  const totalPendingRevenue = pendingRevenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalPendingExpense = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("list.title")}</h1>
        <ExpenseDialog />
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder={t("list.searchPlaceholder")} />
          {/* Só aparece quando há filial de verdade: um seletor com uma opção
              só é ruído. */}
          {filiais.length > 0 && (
            <StatusFilter
              paramKey="filial"
              options={filiais.map((f) => ({ value: f.id, label: f.name }))}
              placeholder={tFil("todas")}
            />
          )}
        </Suspense>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpis.monthlyRevenue.title")}</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">{t("kpis.monthlyRevenue.description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpis.receivable.title")}</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPendingRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {t("kpis.receivable.description", { count: pendingRevenues.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpis.payable.title")}</CardTitle>
            <TrendingDown className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalPendingExpense)}</div>
            <p className="text-xs text-muted-foreground">
              {t("kpis.payable.description", { count: pendingExpenses.length })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Comissões a pagar, por pessoa.
          ACIMA das tabelas de propósito: é o número que o dono confere no
          fechamento, e agrupado por pessoa porque quatro técnicos com vinte OS
          são oitenta linhas que tornariam a tabela de despesas ilegível.
          Só aparece quando existe comissão — empresa que não comissiona não
          ganha um cartão vazio. */}
      {comissoes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t("comissoes.titulo")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("comissoes.explicacao")}</p>
              </div>
              {/* A configuracao mora aqui, ao lado dos numeros que ela muda. */}
              <BaseDaComissao atual={baseDaComissao} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">{t("comissoes.pessoa")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("comissoes.base")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("comissoes.imposto")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("comissoes.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => (
                    <tr key={c.payeeId} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("comissoes.quantasOs", { n: c.quantidade })}
                        </p>
                      </td>
                      {/* A BASE ao lado do valor: quem digita a base é o
                          próprio técnico, item a item, ao concluir. Ver os dois
                          números juntos é o que faz um zero a mais saltar aos
                          olhos antes de o dinheiro sair. */}
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(c.base)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {c.iss > 0 ? `− ${formatCurrency(c.iss)}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(c.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contas a receber */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("receivables.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("receivables.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.description")}</TableHead>
                    <TableHead>{t("columns.dueDate")}</TableHead>
                    <TableHead className="text-right">{t("columns.amount")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenues.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.dueDate)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {formatCurrency(Number(r.amount))}
                      </TableCell>
                      <TableCell>
                        <RevenueStatusBadge status={r.status} dueDate={r.dueDate} />
                      </TableCell>
                      <TableCell>
                        {r.status === "PENDING" && (
                          <PayButton type="revenue" id={r.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Contas a pagar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("payables.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("payables.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.description")}</TableHead>
                    <TableHead>{t("columns.dueDate")}</TableHead>
                    <TableHead className="text-right">{t("columns.amount")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">
                        {e.description}
                        {e.recurring && (
                          <Badge variant="outline" className="ml-2 text-xs">{t("payables.recurringBadge")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(e.dueDate)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {formatCurrency(Number(e.amount))}
                      </TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={e.status} dueDate={e.dueDate} />
                      </TableCell>
                      <TableCell>
                        {e.status === "PENDING" && (
                          <PayButton type="expense" id={e.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

async function RevenueStatusBadge({ status, dueDate }: { status: string; dueDate: Date }) {
  const tCommon = await getTranslations("common")
  const isOverdue = status === "PENDING" && new Date(dueDate) < new Date()
  if (isOverdue) return <Badge variant="destructive">{tCommon("paymentStatus.OVERDUE")}</Badge>
  if (status === "PAID") return <Badge variant="outline">{tCommon("paymentStatus.PAID")}</Badge>
  return <Badge variant="secondary">{tCommon("paymentStatus.PENDING")}</Badge>
}

async function ExpenseStatusBadge({ status, dueDate }: { status: string; dueDate: Date }) {
  const tCommon = await getTranslations("common")
  const isOverdue = status === "PENDING" && new Date(dueDate) < new Date()
  if (isOverdue) return <Badge variant="destructive">{tCommon("paymentStatus.OVERDUE")}</Badge>
  if (status === "PAID") return <Badge variant="outline">{tCommon("paymentStatus.PAID")}</Badge>
  return <Badge variant="secondary">{tCommon("paymentStatus.PENDING")}</Badge>
}
