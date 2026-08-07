"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendTeamInviteEmail } from "@/lib/resend"
import { getTranslator } from "@/lib/i18n"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"

const inviteSchema = z.object({
  name: z.string().min(2, "nameRequired"),
  email: z.string().email("invalidEmail"),
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
  const { tenantId, role: requesterRole, locale } = await getTenant()
  await requireActiveSubscription(tenantId)
  const tt = await getTranslations("team")
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }

  const { name, email, role, document, phone, street, number, complement, district, city, state, zipCode } = parsed.data

  // Limite por IP (probing de vários e-mails) e por e-mail alvo (spam de
  // convite pra mesma caixa de entrada, ou reenvio repetido do mesmo link).
  // (Achado em revisão de segurança 2026-07-21.)
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`invite:ip:${ip}`, 20, 15),
    checkRateLimit(`invite:email:${email.toLowerCase()}`, 5, 60),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { message: (await getTranslations("errors"))("tooManyAttempts") }
  }

  // Checagem GLOBAL (não só deste tenant): o generate_link abaixo, pra um
  // e-mail que já tem auth.users em outro tenant (ou convite pendente lá),
  // reaproveita o mesmo id — e o upsert por id mais abaixo reatribuiria
  // esse usuário (tenantId/role) pra este tenant, sequestrando a conta dele.
  // (Achado em revisão de segurança 2026-07-21.)
  const existing = await prisma.user.findFirst({ where: { email } })
  if (existing) {
    return {
      message:
        existing.tenantId === tenantId
          ? tt("errors.emailInYourTeam")
          : tt("errors.emailInUse"),
    }
  }

  // Try to use Supabase Admin API to invite
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (serviceRoleKey && supabaseUrl) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

    // /admin/invite foi descontinuado nesta versao do GoTrue (retorna 404 texto puro).
    // /admin/generate_link com type "invite" e o equivalente atual — mesmo formato
    // de resposta (id + action_link no nivel raiz). redirectTo aqui so precisa ser
    // uma URL valida pra API aceitar a chamada — nao usamos o action_link que ela
    // geraria (ver comentario abaixo sobre hashed_token).
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
        redirectTo: appUrl,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error("Supabase invite error:", res.status, body)
      return { message: tt("errors.inviteFailed") }
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
      // entao uma falha aqui precisa aparecer pro usuario (nao ha fallback do Supabase).
      //
      // Usamos hashed_token direto (nao data.action_link): o action_link aponta pro
      // /auth/v1/verify hospedado pelo Supabase, que entrega a sessao via fragmento
      // de URL (#access_token=...) — fragmento nunca chega no servidor, entao
      // /api/auth/callback (que so entende ?code=) nunca conseguiria processar isso.
      // /api/auth/confirm recebe o hashed_token bruto por query string e chama
      // verifyOtp() no servidor, que estabelece a sessao via cookie de verdade.
      // (Achado testando o convite de equipe de ponta a ponta, 21/07/2026.)
      let emailSent = false
      if (data.hashed_token) {
        const inviteLink = `${appUrl}/api/auth/confirm?token_hash=${data.hashed_token}&type=invite&next=/dashboard`
        // O convite sai no idioma da empresa (Tenant.locale, já resolvido pelo
        // getTenant acima) — inclusive o nome genérico de fallback, que também
        // aparece no corpo do e-mail. (i18n, item 1.)
        const t = getTranslator(locale, "emails")
        emailSent = await sendTeamInviteEmail(email, name, tenant?.name ?? t("teamInvite.fallbackCompany"), inviteLink, locale)
          .then(() => true)
          .catch((err) => {
            console.error("Resend invite email error:", err)
            return false
          })
      }

      revalidatePath("/team")
      if (!emailSent) {
        return {
          message: tt("errors.inviteEmailFailed", { email }),
        }
      }
      return { success: true, message: tt("errors.inviteSent", { email }) }
    }
    console.error("Supabase invite error:", JSON.stringify(data))
    return { message: data.msg ?? data.message ?? tt("errors.inviteFailed") }
  }

  // Fallback: create a pre-registered DB user without auth (admin will share credentials)
  return { message: tt("errors.missingServiceKey") }
}

export async function updateTeamMemberRole(memberId: string, role: "ADMIN" | "TECHNICIAN") {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return

  // "ADMIN" | "TECHNICIAN" no parâmetro é só o tipo do TypeScript — apagado em
  // runtime, então sem essa validação um ADMIN podia chamar isso com role
  // "OWNER" e se auto-promover. Também bloqueia mexer no próprio papel ou no
  // de um OWNER. (Achado em revisão de segurança 2026-07-19.)
  const parsed = z.enum(["ADMIN", "TECHNICIAN"]).safeParse(role)
  if (!parsed.success) return
  if (memberId === userId) return

  const target = await prisma.user.findUnique({ where: { id: memberId, tenantId }, select: { role: true } })
  if (!target || target.role === "OWNER") return

  await prisma.user.update({
    where: { id: memberId, tenantId },
    data: { role: parsed.data },
  })
  revalidatePath("/team")
}

export async function removeTeamMember(memberId: string) {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return
  if (memberId === userId) return // can't remove yourself

  await prisma.user.delete({ where: { id: memberId, tenantId } })

  // Defesa em profundidade: limpa tenantId/role do user_metadata no Supabase.
  // getTenant() nunca mais confia nesses campos para atribuir tenant/papel,
  // mas isso evita deixar dado stale (apontando pro tenant antigo) na conta
  // da pessoa removida.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (serviceRoleKey && supabaseUrl) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${memberId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ user_metadata: { tenantId: null, role: null } }),
    }).catch(() => null)
  }

  revalidatePath("/team")
}

export async function getTeamMembers() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
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
