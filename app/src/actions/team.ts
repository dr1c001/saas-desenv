"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const inviteSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  role: z.enum(["ADMIN", "TECHNICIAN"]),
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

export type TeamFormState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
}

export async function inviteTeamMember(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const { tenantId, role: requesterRole } = await getTenant()
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
    return { message: "Sem permissão." }
  }

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { name, email, role, document, phone, street, number, complement, district, city, state, zipCode } = parsed.data

  // Check if email already in this tenant
  const existing = await prisma.user.findFirst({ where: { email, tenantId } })
  if (existing) return { message: "Este e-mail já pertence à sua equipe." }

  // Try to use Supabase Admin API to invite
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (serviceRoleKey && supabaseUrl) {
    // Use /admin/invite to actually send the invite email
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        email,
        data: { name, tenantId, role },
      }),
    })
    const data = await res.json()

    if (data.id) {
      await prisma.user.upsert({
        where: { id: data.id },
        create: { id: data.id, name, email, role, tenantId, document: document || null, phone: phone || null },
        update: { name, role, tenantId, document: document || null, phone: phone || null },
      })
      const hasAddress = street || number || city || state || zipCode || complement || district
      if (hasAddress) {
        await prisma.userAddress.upsert({
          where: { userId: data.id },
          create: { userId: data.id, street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
          update: { street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
        })
      }
      revalidatePath("/team")
      return { success: true, message: `Convite enviado para ${email}` }
    }
    console.error("Supabase invite error:", JSON.stringify(data))
    return { message: data.msg ?? data.message ?? "Erro ao enviar convite." }
  }

  // Fallback: create a pre-registered DB user without auth (admin will share credentials)
  return { message: "Configure SUPABASE_SERVICE_ROLE_KEY no .env para enviar convites por e-mail." }
}

export async function updateTeamMemberRole(memberId: string, role: "ADMIN" | "TECHNICIAN") {
  const { tenantId, role: requesterRole } = await getTenant()
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return

  await prisma.user.update({
    where: { id: memberId, tenantId },
    data: { role: role as never },
  })
  revalidatePath("/team")
}

export async function removeTeamMember(memberId: string) {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return
  if (memberId === userId) return // can't remove yourself

  await prisma.user.delete({ where: { id: memberId, tenantId } })
  revalidatePath("/team")
}

export async function getTeamMembers() {
  const { tenantId } = await getTenant()
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      location: { select: { latitude: true, longitude: true, updatedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  })
}
