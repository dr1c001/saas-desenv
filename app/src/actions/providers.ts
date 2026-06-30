"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const providerSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  notes: z.string().optional(),
})

export type ProviderFormState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function createProvider(
  _prev: ProviderFormState,
  formData: FormData
): Promise<ProviderFormState> {
  const { tenantId } = await getTenant()
  const parsed = providerSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  await prisma.provider.create({
    data: {
      ...parsed.data,
      email: parsed.data.email || null,
      document: parsed.data.document || null,
      phone: parsed.data.phone || null,
      specialty: parsed.data.specialty || null,
      notes: parsed.data.notes || null,
      tenantId,
    },
  })

  revalidatePath("/providers")
  redirect("/providers")
}

export async function updateProvider(
  id: string,
  _prev: ProviderFormState,
  formData: FormData
): Promise<ProviderFormState> {
  const { tenantId } = await getTenant()
  const parsed = providerSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  await prisma.provider.update({
    where: { id, tenantId },
    data: {
      ...parsed.data,
      email: parsed.data.email || null,
      document: parsed.data.document || null,
      phone: parsed.data.phone || null,
      specialty: parsed.data.specialty || null,
      notes: parsed.data.notes || null,
    },
  })

  revalidatePath("/providers")
  redirect("/providers")
}

export async function deleteProvider(id: string) {
  const { tenantId } = await getTenant()
  try {
    await prisma.provider.delete({ where: { id, tenantId } })
  } catch {
    return
  }
  revalidatePath("/providers")
  redirect("/providers")
}

export async function getProviders(q?: string) {
  const { tenantId } = await getTenant()
  return prisma.provider.findMany({
    where: {
      tenantId,
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { specialty: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    orderBy: { name: "asc" },
  })
}

export async function getProvider(id: string) {
  const { tenantId } = await getTenant()
  return prisma.provider.findUnique({ where: { id, tenantId } })
}
