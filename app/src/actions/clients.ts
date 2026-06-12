"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const clientSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DEFAULTER"]).default("ACTIVE"),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

export type ClientFormState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const { tenantId } = await getTenant()

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, document, email, phone, status, ...address } = parsed.data

  await prisma.client.create({
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      status,
      tenantId,
      address: {
        create: {
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          district: address.district || null,
          city: address.city || null,
          state: address.state || null,
          zipCode: address.zipCode || null,
        },
      },
    },
  })

  revalidatePath("/clients")
  redirect("/clients")
}

export async function updateClient(
  id: string,
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const { tenantId } = await getTenant()

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, document, email, phone, status, ...address } = parsed.data

  await prisma.client.update({
    where: { id, tenantId },
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      status,
      address: {
        upsert: {
          create: {
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            district: address.district || null,
            city: address.city || null,
            state: address.state || null,
            zipCode: address.zipCode || null,
          },
          update: {
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            district: address.district || null,
            city: address.city || null,
            state: address.state || null,
            zipCode: address.zipCode || null,
          },
        },
      },
    },
  })

  revalidatePath("/clients")
  redirect(`/clients/${id}`)
}

export async function deleteClient(id: string) {
  const { tenantId } = await getTenant()
  await prisma.client.delete({ where: { id, tenantId } })
  revalidatePath("/clients")
  redirect("/clients")
}

export async function getClients() {
  const { tenantId } = await getTenant()
  return prisma.client.findMany({
    where: { tenantId },
    include: { address: true, _count: { select: { serviceOrders: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getClient(id: string) {
  const { tenantId } = await getTenant()
  return prisma.client.findUnique({
    where: { id, tenantId },
    include: { address: true, serviceOrders: { orderBy: { createdAt: "desc" }, take: 10 } },
  })
}
