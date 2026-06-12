"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const orderSchema = z.object({
  title: z.string().min(2, "Título obrigatório"),
  description: z.string().optional(),
  clientId: z.string().min(1, "Cliente obrigatório"),
  technicianId: z.string().optional(),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"])
    .default("OPEN"),
  scheduledAt: z.string().optional(),
})

export type OrderFormState = {
  errors?: Record<string, string[]>
  message?: string
}

async function nextOrderNumber(tenantId: string) {
  const last = await prisma.serviceOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}

export async function createServiceOrder(
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const { tenantId, userId } = await getTenant()

  const raw = Object.fromEntries(formData.entries())
  const parsed = orderSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { title, description, clientId, technicianId, status, scheduledAt } = parsed.data

  // Parse items sent as JSON string
  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const number = await nextOrderNumber(tenantId)

  await prisma.serviceOrder.create({
    data: {
      number,
      title,
      description: description || null,
      clientId,
      tenantId,
      technicianId: technicianId || userId,
      status,
      totalAmount: total,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      items: {
        create: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice,
        })),
      },
    },
  })

  revalidatePath("/service-orders")
  redirect("/service-orders")
}

export async function updateOrderStatus(id: string, status: string) {
  const { tenantId } = await getTenant()

  const validStatus = ["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"]
  if (!validStatus.includes(status)) return

  const data: Record<string, unknown> = { status }
  if (status === "DONE") data.concludedAt = new Date()

  const order = await prisma.serviceOrder.update({
    where: { id, tenantId },
    data,
    select: { number: true, title: true, totalAmount: true },
  })

  // Auto-create revenue when OS is invoiced
  if (status === "INVOICED" && Number(order.totalAmount) > 0) {
    const existing = await prisma.revenue.findFirst({ where: { orderId: id, tenantId } })
    if (!existing) {
      await prisma.revenue.create({
        data: {
          description: `OS #${order.number} — ${order.title}`,
          amount: order.totalAmount,
          dueDate: new Date(),
          tenantId,
          orderId: id,
        },
      })
    }
  }

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  revalidatePath("/finance")
}

export async function deleteServiceOrder(id: string) {
  const { tenantId } = await getTenant()
  await prisma.serviceOrder.delete({ where: { id, tenantId } })
  revalidatePath("/service-orders")
  redirect("/service-orders")
}

export async function getServiceOrders(filters?: { status?: string }) {
  const { tenantId } = await getTenant()
  return prisma.serviceOrder.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
    },
    include: {
      client: { select: { name: true } },
      technician: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getServiceOrder(id: string) {
  const { tenantId } = await getTenant()
  return prisma.serviceOrder.findUnique({
    where: { id, tenantId },
    include: {
      client: true,
      technician: true,
      items: true,
      attachments: true,
    },
  })
}
