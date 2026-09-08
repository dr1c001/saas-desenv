"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { retryOnUniqueConflict } from "@/lib/retry"

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
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)

  // Schema montado aqui dentro (e não no escopo do módulo) porque a mensagem de
  // erro é exibida pro usuário e precisa do t() resolvido no request, que só
  // existe dentro da action. (i18n, item 1.)
  const t = await getTranslations("maintenance")
  const tCommon = await getTranslations("common")
  const orderSchema = z.object({
    title: z.string().min(2, t("form.errors.titleRequired")),
    description: z.string().optional(),
    providerId: z.string().optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).default("OPEN"),
    scheduledAt: z.string().optional(),
  })

  if (role !== "OWNER" && role !== "ADMIN") return { message: tCommon("noPermission") }
  const parsed = orderSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  // providerId vem do formulário sem checagem — sem validar que pertence ao
  // próprio tenant, dava pra linkar a OM a um Provider de outra empresa e ver
  // os dados completos dele. (Achado em revisão de segurança 2026-07-19.)
  if (parsed.data.providerId) {
    const provider = await prisma.provider.findUnique({
      where: { id: parsed.data.providerId, tenantId },
      select: { id: true },
    })
    if (!provider) return { message: (await getTranslations("errors"))("providerNotFound") }
  }

  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  // nextOmNumber lê "o último número" sem lock — duas criações simultâneas
  // podem calcular o mesmo número. number tem @@unique([tenantId, number]),
  // então a segunda só falha (P2002) em vez de duplicar; retryOnUniqueConflict
  // tenta de novo com o número atualizado. (Achado em auditoria pré-venda,
  // 2026-08-05.)
  await retryOnUniqueConflict(async () => {
    const number = await nextOmNumber(tenantId)
    return prisma.maintenanceOrder.create({
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
  })

  revalidatePath("/maintenance")
  redirect("/maintenance")
}

export async function updateMaintenanceStatus(id: string, status: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  const valid = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]
  if (!valid.includes(status)) return

  const data: Record<string, unknown> = { status }
  if (status === "DONE") data.concludedAt = new Date()

  await prisma.maintenanceOrder.update({ where: { id, tenantId }, data })
  revalidatePath("/maintenance")
  revalidatePath(`/maintenance/${id}`)
}

export async function deleteMaintenanceOrder(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") redirect("/maintenance")
  await prisma.maintenanceOrder.delete({ where: { id, tenantId } })
  revalidatePath("/maintenance")
  redirect("/maintenance")
}

export async function getMaintenanceOrders(filters?: { status?: string; q?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
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
  await requireActiveSubscription(tenantId)
  return prisma.maintenanceOrder.findUnique({
    where: { id, tenantId },
    include: { provider: true, items: true },
  })
}
