"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const tenantSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
})

const userSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  phone: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
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
    data: {
      name: parsed.data.name,
      document: parsed.data.document || null,
      logoUrl: parsed.data.logoUrl || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      address: parsed.data.address || null,
    },
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

  const { name, document, phone, street, number, complement, district, city, state, zipCode } = parsed.data

  await prisma.user.update({
    where: { id: userId },
    data: { name, document: document || null, phone: phone || null },
  })

  const hasAddress = street || number || city || state || zipCode || complement || district
  if (hasAddress) {
    await prisma.userAddress.upsert({
      where: { userId },
      create: { userId, street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
      update: { street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
    })
  }

  revalidatePath("/settings")
  return { message: "Perfil atualizado." }
}

export async function updateWhatsApp(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { tenantId } = await getTenant()
  const instance = (formData.get("zapiInstance") as string) || null
  const token = (formData.get("zapiToken") as string) || null
  await prisma.tenant.update({ where: { id: tenantId }, data: { zapiInstance: instance, zapiToken: token } })
  revalidatePath("/settings")
  return { message: "Configurações de WhatsApp salvas." }
}

export async function getSettings() {
  const { tenantId, userId } = await getTenant()
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, document: true, logoUrl: true, phone: true, website: true, address: true, zapiInstance: true, zapiToken: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: true, document: true, phone: true, userAddress: true },
    }),
  ])
  return { tenant, user }
}
