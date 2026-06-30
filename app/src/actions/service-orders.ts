"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { sendPushToUser } from "@/lib/push"

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

  // Send push notification to assigned technician
  if (technicianId && technicianId !== userId) {
    try {
      const subs = await prisma.pushSubscription.findMany({
        where: { userId: technicianId },
        select: { endpoint: true, p256dh: true, auth: true },
      })
      if (subs.length > 0) {
        await sendPushToUser(subs, {
          title: "Nova Ordem de Serviço",
          body: title,
          url: "/service-orders",
        })
      }
    } catch {
      // Push failure should not block OS creation
    }
  }

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
    select: { number: true, title: true, totalAmount: true, createdAt: true },
  })

  // Auto-create revenue when OS is invoiced
  if (status === "INVOICED" && Number(order.totalAmount) > 0) {
    const existing = await prisma.revenue.findFirst({ where: { orderId: id, tenantId } })
    const year = new Date(order.createdAt).getFullYear()
    const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
    if (!existing) {
      await prisma.revenue.create({
        data: {
          description: `${osNum} — ${order.title}`,
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

export async function completeServiceOrder(
  id: string,
  conclusionNote: string,
  items: { description: string; quantity: number; unitPrice: number }[],
  invoiceImmediately: boolean
) {
  const { tenantId } = await getTenant()

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const status = invoiceImmediately ? "INVOICED" : "DONE"

  // Fetch order before transaction — needed for revenue description
  const order = await prisma.serviceOrder.findUnique({
    where: { id, tenantId },
    select: { number: true, title: true, createdAt: true, status: true },
  })
  if (!order) throw new Error("Ordem não encontrada")

  await prisma.serviceItem.deleteMany({ where: { orderId: id } })
  if (items.length > 0) {
    await prisma.serviceItem.createMany({
      data: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
        orderId: id,
      })),
    })
  }
  await prisma.serviceOrder.update({
    where: { id, tenantId },
    data: {
      status,
      concludedAt: new Date(),
      conclusionNote: conclusionNote || null,
      totalAmount: total,
    },
  })
  if (invoiceImmediately && total > 0) {
    const existing = await prisma.revenue.findFirst({ where: { orderId: id, tenantId } })
    if (!existing) {
      const year = new Date(order.createdAt).getFullYear()
      const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
      await prisma.revenue.create({
        data: {
          description: `${osNum} — ${order.title}`,
          amount: total,
          dueDate: new Date(),
          tenantId,
          orderId: id,
        },
      })
    }
  }

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  revalidatePath("/history")
  revalidatePath("/finance")
}

export async function updateServiceOrder(
  id: string,
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const { tenantId } = await getTenant()

  const raw = Object.fromEntries(formData.entries())
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { title, description, clientId, technicianId, scheduledAt } = parsed.data

  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  await prisma.serviceItem.deleteMany({ where: { orderId: id } })
  if (items.length > 0) {
    await prisma.serviceItem.createMany({
      data: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
        orderId: id,
      })),
    })
  }
  await prisma.serviceOrder.update({
    where: { id, tenantId },
    data: {
      title,
      description: description || null,
      clientId,
      technicianId: technicianId || null,
      totalAmount: total,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  })

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  redirect(`/service-orders/${id}`)
}

export async function deleteServiceOrder(id: string) {
  const { tenantId } = await getTenant()
  await prisma.serviceOrder.delete({ where: { id, tenantId } })
  revalidatePath("/service-orders")
  redirect("/service-orders")
}

export async function getServiceOrders(filters?: { status?: string; statusIn?: string[]; q?: string }) {
  const { tenantId } = await getTenant()
  return prisma.serviceOrder.findMany({
    where: {
      tenantId,
      ...(filters?.statusIn
        ? { status: { in: filters.statusIn as never[] } }
        : filters?.status
          ? { status: filters.status as never }
          : {}),
      ...(filters?.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" } },
              { description: { contains: filters.q, mode: "insensitive" } },
              { client: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      client: { select: { name: true } },
      technician: { select: { name: true } },
      items: { select: { description: true, quantity: true, unitPrice: true } },
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
