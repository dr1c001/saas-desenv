import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { AlertTriangle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

type Props = { tenantId: string }

export async function OverdueAlerts({ tenantId }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [overdueRevenues, overdueExpenses] = await Promise.all([
    prisma.revenue.findMany({
      where: { tenantId, status: "PENDING", dueDate: { lt: today } },
      select: { id: true, description: true, amount: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.expense.findMany({
      where: { tenantId, status: "PENDING", dueDate: { lt: today } },
      select: { id: true, description: true, amount: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ])

  if (overdueRevenues.length === 0 && overdueExpenses.length === 0) return null

  const t = await getTranslations("sharedComponents.overdueAlerts")

  const totalOverdueRevenue = overdueRevenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalOverdueExpense = overdueExpenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="border-b bg-destructive/5 px-4 py-2">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-sm font-semibold">{t("title")}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {overdueRevenues.length > 0 && (
            <Link href="/finance" className="hover:underline">
              <span className="text-destructive font-medium">
                {t("overdueRevenues", { count: overdueRevenues.length })}
              </span>
              <span className="text-muted-foreground ml-1">({formatCurrency(totalOverdueRevenue)})</span>
            </Link>
          )}
          {overdueExpenses.length > 0 && (
            <Link href="/finance" className="hover:underline">
              <span className="text-destructive font-medium">
                {t("overdueExpenses", { count: overdueExpenses.length })}
              </span>
              <span className="text-muted-foreground ml-1">({formatCurrency(totalOverdueExpense)})</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
