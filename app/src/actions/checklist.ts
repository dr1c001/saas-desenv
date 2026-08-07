"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

export async function addChecklistItem(orderId: string, description: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId } })
  if (!order) throw new Error((await getTranslations("errors"))("orderNotFound"))

  const count = await prisma.checklistItem.count({ where: { orderId } })
  await prisma.checklistItem.create({ data: { orderId, description, position: count } })
  revalidatePath(`/service-orders/${orderId}`)
}

export async function toggleChecklistItem(itemId: string, completed: boolean) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, order: { tenantId } },
  })
  if (!item) throw new Error((await getTranslations("errors"))("itemNotFound"))
  await prisma.checklistItem.update({ where: { id: itemId }, data: { completed } })
  revalidatePath(`/service-orders/${item.orderId}`)
}

export async function deleteChecklistItem(itemId: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, order: { tenantId } },
  })
  if (!item) throw new Error((await getTranslations("errors"))("itemNotFound"))
  await prisma.checklistItem.delete({ where: { id: itemId } })
  revalidatePath(`/service-orders/${item.orderId}`)
}
