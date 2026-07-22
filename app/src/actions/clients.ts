"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { geocodeAddress } from "@/lib/geocode"

const clientSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
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
  await requireActiveSubscription(tenantId)

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, document, email, phone, whatsapp, status, ...address } = parsed.data

  const coords = await geocodeAddress(address)

  await prisma.client.create({
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
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
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
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
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // createClient fica sem checagem (technician cadastra cliente em campo,
  // fluxo legítimo), mas updateClient também permite marcar o cliente como
  // DEFAULTER (inadimplente) — isso precisa de OWNER/ADMIN.
  // (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") return { message: "Sem permissão." }

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, document, email, phone, whatsapp, status, ...address } = parsed.data

  const coords = await geocodeAddress(address)

  await prisma.client.update({
    where: { id, tenantId },
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
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
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
          },
          update: {
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            district: address.district || null,
            city: address.city || null,
            state: address.state || null,
            zipCode: address.zipCode || null,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
          },
        },
      },
    },
  })

  revalidatePath("/clients")
  redirect(`/clients/${id}`)
}

export async function deleteClient(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") redirect("/clients")
  await prisma.client.delete({ where: { id, tenantId } })
  revalidatePath("/clients")
  redirect("/clients")
}

export async function getClients(filters?: { q?: string; status?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.client.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { document: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { address: true, _count: { select: { serviceOrders: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getClient(id: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.client.findUnique({
    where: { id, tenantId },
    include: {
      address: true,
      serviceOrders: {
        select: { id: true, number: true, title: true, status: true, totalAmount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })
}
