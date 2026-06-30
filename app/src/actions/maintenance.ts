"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const orderSchema = z.object({
  title: z.string().min(2, "Título obrigatório"),
  description: z.string().optional(),
  providerId: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).default("OPEN"),
  scheduledAt: z.string().optional(),
})

export type MaintenanceFormState = {
  errors?: Record<string, string[]>
  message?: string
}

async function nextOmNumber(tenantId: string) {
  const last = await prisma.maintenanceOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}

export async function createMaintenanceOrder(
  _prev: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  const { tenantId } = await getTenant()
  const parsed = orderSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const number = await nextOmNumber(tenantId)

  await prisma.maintenanceOrder.create({
    data: {
      number,
      title: parsed.data.title,
      description: parsed.data.description || null,
      providerId: parsed.data.providerId || null,
      status: parsed.data.status,
      totalAmount: total,
      tenantId,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
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

  revalidatePath("/maintenance")
  redirect("/maintenance")
}

export async function updateMaintenanceStatus(id: string, status: string) {
  const { tenantId } = await getTenant()
  const valid = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]
  if (!valid.includes(status)) return

  const data: Record<string, unknown> = { status }
  if (status === "DONE") data.concludedAt = new Date()

  await prisma.maintenanceOrder.update({ where: { id, tenantId }, data })
  revalidatePath("/maintenance")
  revalidatePath(`/maintenance/${id}`)
}

export async function deleteMaintenanceOrder(id: string) {
  const { tenantId } = await getTenant()
  await prisma.maintenanceOrder.delete({ where: { id, tenantId } })
  revalidatePath("/maintenance")
  redirect("/maintenance")
}

export async function getMaintenanceOrders(filters?: { status?: string; q?: string }) {
  const { tenantId } = await getTenant()
  return prisma.maintenanceOrder.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.q ? {
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: {
      provider: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getMaintenanceOrder(id: string) {
  const { tenantId } = await getTenant()
  return prisma.maintenanceOrder.findUnique({
    where: { id, tenantId },
    include: { provider: true, items: true },
  })
}
