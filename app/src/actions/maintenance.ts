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
    assetId: z.string().optional(),
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

  // O BEM que está em manutenção.
  //
  // `assetId` existia no schema, com a documentação da regra escrita nele — "dá
  // histórico à van: quantas vezes parou, quanto já custou, e quando". `getBem`
  // fazia o `include`, `excluirBem` contava `_count.maintenance` para recusar a
  // exclusão, e havia três textos de tela sobre isso em pt e en.
  //
  // NENHUMA linha de produção gravava o campo: o formulário não oferecia o bem
  // e esta Action não o lia. Consequências: a contagem era sempre zero, então
  // `excluirBem` NUNCA recusava e o dono apagava a van sem o aviso que a
  // mensagem prometia; e o histórico do bem nunca aparecia na tela.
  //
  // Mesma checagem de posse do `providerId` acima, e pelo mesmo motivo: um id
  // vindo do formulário sem validar tenant ligaria a OM ao bem de outra
  // empresa. (Achado na auditoria de 13/09/2026.)
  if (parsed.data.assetId) {
    const bem = await prisma.asset.findUnique({
      where: { id: parsed.data.assetId, tenantId },
      select: { id: true },
    })
    if (!bem) return { message: (await getTranslations("errors"))("assetNotFound") }
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
        assetId: parsed.data.assetId || null,
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
