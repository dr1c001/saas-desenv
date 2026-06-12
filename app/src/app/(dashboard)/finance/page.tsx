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
import { PayButton } from "@/components/finance/pay-button"

export default async function FinancePage() {
  const { revenues, expenses, monthlyRevenue, pendingRevenues, pendingExpenses } =
    await getFinanceSummary()

  const totalPendingRevenue = pendingRevenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalPendingExpense = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const balance = monthlyRevenue - expenses
    .filter((e) => e.status === "PAID" && e.paidAt)
    .reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <ExpenseDialog />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita do mês</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">Pagamentos recebidos este mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPendingRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {pendingRevenues.length} pagamento{pendingRevenues.length !== 1 ? "s" : ""} pendente{pendingRevenues.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <TrendingDown className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalPendingExpense)}</div>
            <p className="text-xs text-muted-foreground">
              {pendingExpenses.length} despesa{pendingExpenses.length !== 1 ? "s" : ""} pendente{pendingExpenses.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contas a receber */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a Receber</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum recebimento cadastrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
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
            <CardTitle className="text-base">Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhuma despesa cadastrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">
                        {e.description}
                        {e.recurring && (
                          <Badge variant="outline" className="ml-2 text-xs">Recorrente</Badge>
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

function RevenueStatusBadge({ status, dueDate }: { status: string; dueDate: Date }) {
  const isOverdue = status === "PENDING" && new Date(dueDate) < new Date()
  if (isOverdue) return <Badge variant="destructive">Vencida</Badge>
  if (status === "PAID") return <Badge variant="outline">Paga</Badge>
  return <Badge variant="secondary">Pendente</Badge>
}

function ExpenseStatusBadge({ status, dueDate }: { status: string; dueDate: Date }) {
  const isOverdue = status === "PENDING" && new Date(dueDate) < new Date()
  if (isOverdue) return <Badge variant="destructive">Vencida</Badge>
  if (status === "PAID") return <Badge variant="outline">Paga</Badge>
  return <Badge variant="secondary">Pendente</Badge>
}
