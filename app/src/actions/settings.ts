"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"


const tenantSchema = z.object({
  name: z.string().min(2, "nameRequired"),
  document: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
})

const userSchema = z.object({
  name: z.string().min(2, "nameRequired"),
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
  if (role !== "OWNER" && role !== "ADMIN") return { message: (await getTranslations("common"))("noPermission") }
  const parsed = tenantSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: parsed.data.name,
      document: parsed.data.document || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      address: parsed.data.address || null,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return { message: (await getTranslations("settingsCore"))("saved.tenant") }
}

export async function updateProfile(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { userId } = await getTenant()
  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }

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
  return { message: (await getTranslations("settingsCore"))("saved.profile") }
}

export async function updateWhatsApp(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { message: (await getTranslations("common"))("noPermission") }
  const instance = (formData.get("zapiInstance") as string) || null
  const token = (formData.get("zapiToken") as string) || null
  await prisma.tenant.update({ where: { id: tenantId }, data: { zapiInstance: instance, zapiToken: token } })
  revalidatePath("/settings")
  return { message: (await getTranslations("settingsCore"))("saved.whatsapp") }
}

// Idioma é por empresa (não por usuário/dispositivo, ao contrário do tema) —
// governa dashboard, e-mails e PDFs gerados pro tenant inteiro, então só
// OWNER/ADMIN pode trocar, mesmo padrão de updateTenant(). (Item 1 do
// roadmap, 06/08/2026.)
export async function updateLocale(locale: "pt" | "en") {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") return
  if (locale !== "pt" && locale !== "en") return

  await prisma.tenant.update({ where: { id: tenantId }, data: { locale } })
  revalidatePath("/", "layout")
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

// ─── Logo da empresa ─────────────────────────────────────────────────────────
//
// Antes o logo era um campo de URL: a empresa precisava hospedar a imagem em
// algum lugar e colar o endereço. Fora de ser trabalhoso, isso fazia o servidor
// BUSCAR aquela URL toda vez que gerava um PDF — o que exigia todo um bloqueio
// de IP privado pra evitar SSRF (169.254.169.254, metadata de nuvem) e ainda
// deixava o PDF à mercê de a URL sair do ar.
//
// Esse bloqueio virou código morto quando o campo deixou de existir, e o
// comentário dele continuou por aqui PROMETENDO uma proteção que não estava
// mais ligada — o pior tipo de comentário, o que mente para quem revisa.
// Removido em 21/08/2026, depois de confirmar em produção que nenhuma empresa
// tem mais logo por URL externa (0 de 4).
//
// Se um dia o campo de URL voltar, o bloqueio precisa voltar JUNTO: o
// @react-pdf/renderer busca a URL do lado do servidor.
//
// Agora o arquivo é enviado direto, convertido pra PNG e guardado embutido
// (data URI) na mesma coluna. O PDF não busca nada na rede, e converter no
// servidor neutraliza qualquer payload escondido no arquivo original.

const TAMANHO_MAXIMO = 2 * 1024 * 1024
const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"]

export type LogoFormState = { message?: string; success?: boolean }

export async function enviarLogo(_prev: LogoFormState, formData: FormData): Promise<LogoFormState> {
  const { tenantId, role } = await getTenant()
  const tc = await getTranslations("common")
  if (role !== "OWNER" && role !== "ADMIN") return { message: tc("noPermission") }
  await requireActiveSubscription(tenantId)

  const t = await getTranslations("settingsCore.company.logo")
  const arquivo = formData.get("logo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { message: t("chooseFile") }
  if (arquivo.size > TAMANHO_MAXIMO) return { message: t("tooLarge") }
  // SVG fica de fora de propósito: pode carregar script, e renderizar SVG não
  // confiável no servidor já rendeu CVE. PNG/JPG/WEBP cobrem o caso real.
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return { message: t("wrongType") }

  try {
    const { default: sharp } = await import("sharp")
    const png = await sharp(Buffer.from(await arquivo.arrayBuffer()))
      // "inside" preserva a proporção; withoutEnlargement evita esticar um
      // logo pequeno e deixá-lo borrado no PDF.
      .resize({ width: 400, height: 160, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: `data:image/png;base64,${png.toString("base64")}` },
    })
  } catch (err) {
    console.error("[logo] falha ao processar imagem:", err)
    return { message: t("failed") }
  }

  revalidatePath("/settings")
  return { success: true, message: t("saved") }
}

export async function removerLogo(): Promise<void> {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") return
  await requireActiveSubscription(tenantId)

  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: null } })
  revalidatePath("/settings")
}
