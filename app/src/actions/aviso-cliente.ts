"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { lerConfig, type ConfigAviso } from "@/lib/aviso-cliente"

export type EstadoAviso = { erro?: string; ok?: boolean }

export async function getAvisoCliente(): Promise<{
  config: ConfigAviso
  whatsappConfigurado: boolean
}> {
  const { tenantId } = await getTenant()
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { clientNotifications: true, zapiInstance: true, zapiToken: true },
  })
  return {
    config: lerConfig(t?.clientNotifications),
    whatsappConfigurado: Boolean(t?.zapiInstance && t?.zapiToken),
  }
}

export async function salvarAvisoCliente(
  _prev: EstadoAviso,
  formData: FormData
): Promise<EstadoAviso> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Quem responde por mensagem indesejada ao cliente final é a empresa —
  // então quem decide é o dono dela, não quem está em campo.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const marcado = (nome: string) => formData.get(nome) === "on"

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      clientNotifications: {
        ativo: marcado("ativo"),
        aCaminho: marcado("aCaminho"),
        concluido: marcado("concluido"),
        porWhatsapp: marcado("porWhatsapp"),
        porEmail: marcado("porEmail"),
      },
    },
  })

  revalidatePath("/settings")
  return { ok: true }
}
