"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { brtMidnightUTC } from "@/lib/utils"

export async function getReportData(from: string, to: string) {
  const { tenantId, role } = await getTenant()
  // Auto-defesa: mesmo padrão do getFinanceSummary() em finance.ts — Action
  // tem Action ID próprio, despachável independente da página que redireciona
  // antes. (Achado em revisão de segurança 2026-07-21.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("Sem permissão.")
  await requireActiveSubscription(tenantId)

  // from/to vêm do <input type="date"> como "AAAA-MM-DD" — new Date(from)
  // parseava isso como meia-noite UTC, que é 21h do dia anterior em horário
  // de Brasília (UTC-3): o relatório de "01/08" incluía 3h da noite de
  // 31/07. Monta os limites como meia-noite BRT de verdade (ver
  // brtMidnightUTC em lib/utils.ts), fim exclusive (início do dia seguinte)
  // em vez de 23:59:59 pra não truncar o último segundo do dia.
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  const [fromY, fromM, fromD] = from.split("-").map(Number)
  const [toY, toM, toD] = to.split("-").map(Number)
  const start = brtMidnightUTC(fromY, fromM - 1, fromD)
  const end = brtMidnightUTC(toY, toM - 1, toD + 1)

  const [revenues, expenses, orders, topClients] = await Promise.all([
    prisma.revenue.findMany({
      where: { tenantId, status: "PAID", paidAt: { gte: start, lt: end } },
      include: { order: { select: { number: true, title: true, createdAt: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { tenantId, status: "PAID", paidAt: { gte: start, lt: end } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.serviceOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
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
            revenues: { some: { status: "PAID", paidAt: { gte: start, lt: end } } },
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
