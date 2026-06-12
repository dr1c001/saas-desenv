"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function getReportData(from: string, to: string) {
  const { tenantId } = await getTenant()
  const start = new Date(from)
  const end = new Date(to)
  end.setHours(23, 59, 59)

  const [revenues, expenses, orders, topClients] = await Promise.all([
    prisma.revenue.findMany({
      where: { tenantId, status: "PAID", paidAt: { gte: start, lte: end } },
      include: { order: { select: { number: true, title: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { tenantId, status: "PAID", paidAt: { gte: start, lte: end } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.serviceOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
        status: { notIn: ["CANCELLED"] },
      },
      select: { status: true, totalAmount: true },
    }),
    prisma.client.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        serviceOrders: {
          where: {
            status: "INVOICED",
            revenues: { some: { status: "PAID", paidAt: { gte: start, lte: end } } },
          },
          select: { totalAmount: true },
        },
      },
    }),
  ])

  const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const result = totalRevenue - totalExpense

  const osByStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const ranked = topClients
    .map((c) => ({
      name: c.name,
      total: c.serviceOrders.reduce((s, o) => s + Number(o.totalAmount), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return {
    revenues,
    expenses,
    totalRevenue,
    totalExpense,
    result,
    osByStatus,
    topClients: ranked,
  }
}
