"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"

export async function getMonthlyRevenueChart() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  // Last 6 months
  const now = new Date()
  const months: { label: string; start: Date; end: Date }[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    months.push({
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      start,
      end,
    })
  }

  const results = await Promise.all(
    months.map(async ({ label, start, end }) => {
      const [revenue, expense] = await Promise.all([
        prisma.revenue.aggregate({
          where: { tenantId, status: "PAID", paidAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { tenantId, status: "PAID", paidAt: { gte: start, lte: end } },
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
