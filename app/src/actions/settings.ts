"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

// logoUrl é buscado pelo servidor (@react-pdf/renderer faz fetch() dela ao
// gerar PDFs) — sem bloquear IPs privados/loopback/link-local, qualquer
// OWNER/ADMIN podia apontar o logo pra rede interna (ex: 169.254.169.254,
// metadata de nuvem) e ter o servidor buscando aquilo a cada PDF gerado
// (SSRF). Isso bloqueia o vetor direto (IP literal); não protege contra
// DNS rebinding (domínio que resolve pra IP público na validação e pra IP
// privado no fetch real) — mitigação completa disso exigiria buscar a
// imagem nós mesmos com IP pinning, fora do escopo desta correção.
// (Achado em revisão de segurança 2026-07-19.)
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // inclui metadata de nuvem
  }
  return false
}

function isSafeLogoUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === "https:" && !isPrivateOrLoopbackHost(hostname)
  } catch {
    return false
  }
}

const tenantSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  document: z.string().optional(),
  logoUrl: z
    .string()
    .url("URL inválida")
    .optional()
    .or(z.literal(""))
    .refine((url) => !url || isSafeLogoUrl(url), "URL do logotipo não permitida — use https e um host público"),
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
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") return { message: "Sem permissão." }
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
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") return { message: "Sem permissão." }
  const instance = (formData.get("zapiInstance") as string) || null
  const token = (formData.get("zapiToken") as string) || null
  await prisma.tenant.update({ where: { id: tenantId }, data: { zapiInstance: instance, zapiToken: token } })
  revalidatePath("/settings")
  return { message: "Configurações de WhatsApp salvas." }
}

export async function getSettings() {
  const { tenantId, userId, role } = await getTenant()
  const isAdmin = role === "OWNER" || role === "ADMIN"
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
  // zapiToken é a credencial do WhatsApp da empresa — só OWNER/ADMIN podem
  // ver/editar isso (empresa e integração WhatsApp). (Revisão de segurança 2026-07-19.)
  return {
    tenant: tenant && { ...tenant, zapiInstance: isAdmin ? tenant.zapiInstance : null, zapiToken: isAdmin ? tenant.zapiToken : null },
    user,
    isAdmin,
    isOwner: role === "OWNER",
  }
}
