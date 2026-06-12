"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const tenantSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
})

const userSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
})

export type SettingsFormState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function updateTenant(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { tenantId } = await getTenant()
  const parsed = tenantSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: parsed.data.name, document: parsed.data.document || null },
  })

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return { message: "Dados da empresa atualizados." }
}

export async function updateProfile(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { userId } = await getTenant()
  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name },
  })

  revalidatePath("/settings")
  return { message: "Perfil atualizado." }
}

export async function getSettings() {
  const { tenantId, userId } = await getTenant()
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } }),
  ])
  return { tenant, user }
}
