"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"

export async function getScheduledOrders(year: number, month: number) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  return prisma.serviceOrder.findMany({
    where: {
      tenantId,
      scheduledAt: { gte: start, lte: end },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      client: { select: { name: true } },
      technician: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  })
}
