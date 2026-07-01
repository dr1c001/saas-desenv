"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function addChecklistItem(orderId: string, description: string) {
  const { tenantId } = await getTenant()
  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId } })
  if (!order) throw new Error("OS não encontrada")

  const count = await prisma.checklistItem.count({ where: { orderId } })
  await prisma.checklistItem.create({ data: { orderId, description, position: count } })
  revalidatePath(`/service-orders/${orderId}`)
}

export async function toggleChecklistItem(itemId: string, completed: boolean) {
  const { tenantId } = await getTenant()
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, order: { tenantId } },
  })
  if (!item) throw new Error("Item não encontrado")
  await prisma.checklistItem.update({ where: { id: itemId }, data: { completed } })
  revalidatePath(`/service-orders/${item.orderId}`)
}

export async function deleteChecklistItem(itemId: string) {
  const { tenantId } = await getTenant()
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, order: { tenantId } },
  })
  if (!item) throw new Error("Item não encontrado")
  await prisma.checklistItem.delete({ where: { id: itemId } })
  revalidatePath(`/service-orders/${item.orderId}`)
}
