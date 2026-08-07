"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { getTranslations } from "next-intl/server"

export async function getMonthlyRevenueChart() {
  const { tenantId, role } = await getTenant()
  // Financeiro é OWNER/ADMIN-only em todo o resto do sistema (finance.ts,
  // reports.ts) — este gráfico expunha os mesmos totais de receita/despesa
  // pra qualquer TECHNICIAN via /dashboard. (Achado em auditoria pré-venda,
  // 2026-08-05.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  // Last 6 months (limites de mês em horário de Brasília, não UTC do
  // servidor — ver brtMidnightUTC em lib/utils.ts)
  const { year, month } = todayInBRT()
  const months: { label: string; start: Date; end: Date }[] = []

  for (let i = 5; i >= 0; i--) {
    const m = month - i
    const start = brtMidnightUTC(year, m, 1)
    const end = brtMidnightUTC(year, m + 1, 1) // início do mês seguinte, exclusive
    months.push({
      label: new Date(year, m, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      start,
      end,
    })
  }

  const results = await Promise.all(
    months.map(async ({ label, start, end }) => {
      const [revenue, expense] = await Promise.all([
        prisma.revenue.aggregate({
          where: { tenantId, status: "PAID", paidAt: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { tenantId, status: "PAID", paidAt: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
      ])
      return {
        month: label,
        receita: Number(revenue._sum.amount ?? 0),
        despesa: Number(expense._sum.amount ?? 0),
      }
    })
  )

  return results
}
