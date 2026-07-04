"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { sendTeamInviteEmail } from "@/lib/resend"

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"
    const redirectTo = `${appUrl}/api/auth/callback`

    // /admin/invite foi descontinuado nesta versao do GoTrue (retorna 404 texto puro).
    // /admin/generate_link com type "invite" e o equivalente atual — mesmo formato
    // de resposta (id + action_link no nivel raiz).
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        type: "invite",
        email,
        data: { name, tenantId, role },
        redirectTo,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error("Supabase invite error:", res.status, body)
      return { message: "Erro ao enviar convite. Tente novamente em instantes." }
    }
    const data = await res.json()

    if (data.id) {
      // Save user in DB
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

      // Get tenant name for the email
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })

      // generate_link so cria o link, nao envia e-mail — o Resend e o unico envio,
      // entao uma falha aqui precisa aparecer pro usuario (nao ha fallback do Supabase)
      let emailSent = false
      if (data.action_link) {
        emailSent = await sendTeamInviteEmail(email, name, tenant?.name ?? "sua empresa", data.action_link)
          .then(() => true)
          .catch((err) => {
            console.error("Resend invite email error:", err)
            return false
          })
      }

      revalidatePath("/team")
      if (!emailSent) {
        return {
          message: `Membro adicionado, mas o e-mail de convite falhou. Peça para ${email} usar "Esqueci minha senha" com este e-mail para entrar.`,
        }
      }
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
