"use server"

import { prisma } from "@/lib/prisma"
import { checarAcao, getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

export async function addChecklistItem(orderId: string, description: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  // "Checklist" é vendido a partir do plano Pro. Só a CRIAÇÃO é barrada:
  // marcar ou apagar item já existente continua livre, senão quem trocasse
  // de plano ficaria com um checklist preso na tela, sem como limpar.
  await requireRecurso(tenantId, "checklist")
  if (await checarAcao("os.checklist")) return
  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId } })
  if (!order) throw new Error((await getTranslations("errors"))("orderNotFound"))

  const count = await prisma.checklistItem.count({ where: { orderId } })
  await prisma.checklistItem.create({ data: { orderId, description, position: count } })
  revalidatePath(`/service-orders/${orderId}`)
}

export async function toggleChecklistItem(itemId: string, completed: boolean) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (await checarAcao("os.checklist")) return
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
  if (await checarAcao("os.checklist")) return
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, order: { tenantId } },
  })
  if (!item) throw new Error((await getTranslations("errors"))("itemNotFound"))
  await prisma.checklistItem.delete({ where: { id: itemId } })
  revalidatePath(`/service-orders/${item.orderId}`)
}
