"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { silenciadosValidos } from "@/lib/notificacoes"

export type PreferenciasDeAviso = {
  silenciados: string[]
  semSom: boolean
}

/** O que ESTA pessoa escolheu. */
export async function minhasPreferencias(): Promise<PreferenciasDeAviso> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { mutedNotifications: true, silentNotifications: true },
  })
  return {
    silenciados: u?.mutedNotifications ?? [],
    semSom: u?.silentNotifications ?? false,
  }
}

/**
 * Grava a preferência de QUEM ESTÁ PEDINDO.
 *
 * Sem parâmetro de usuário, pelo mesmo motivo da assinatura: Server Action é
 * endereço HTTP, e aceitar `userId` deixaria silenciar as notificações de
 * outra pessoa — que é uma forma silenciosa de esconder trabalho dela.
 *
 * Recebe os SILENCIADOS, não os desejados. Se recebesse os desejados, um erro
 * que enviasse lista vazia calaria o sistema inteiro para a pessoa.
 */
export async function salvarPreferencias(
  silenciados: string[],
  semSom: boolean
): Promise<{ ok: true }> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  await prisma.user.update({
    where: { id: userId, tenantId },
    data: {
      mutedNotifications: silenciadosValidos(silenciados),
      silentNotifications: semSom === true,
    },
  })

  revalidatePath("/settings")
  return { ok: true }
}
