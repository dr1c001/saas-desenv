"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function getClientEquipments(clientId: string) {
  const { tenantId } = await getTenant()
  return prisma.equipment.findMany({
    where: { clientId, tenantId },
    orderBy: { createdAt: "desc" },
  })
}

export async function createEquipment(clientId: string, formData: FormData) {
  const { tenantId } = await getTenant()
  const client = await prisma.client.findUnique({ where: { id: clientId, tenantId } })
  if (!client) throw new Error("Cliente não encontrado")

  const installDateRaw = formData.get("installDate") as string
  const warrantyRaw = formData.get("warrantyUntil") as string

  await prisma.equipment.create({
    data: {
      tenantId,
      clientId,
      name: (formData.get("name") as string).trim(),
      brand: (formData.get("brand") as string) || null,
      model: (formData.get("model") as string) || null,
      serialNumber: (formData.get("serialNumber") as string) || null,
      notes: (formData.get("notes") as string) || null,
      installDate: installDateRaw ? new Date(installDateRaw) : null,
      warrantyUntil: warrantyRaw ? new Date(warrantyRaw) : null,
    },
  })
  revalidatePath(`/clients/${clientId}`)
}

export async function deleteEquipment(equipmentId: string, clientId: string) {
  const { tenantId } = await getTenant()
  await prisma.equipment.deleteMany({ where: { id: equipmentId, tenantId } })
  revalidatePath(`/clients/${clientId}`)
}
