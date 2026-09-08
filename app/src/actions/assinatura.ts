"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { comoDataUri, conferirAssinatura, dimensaoServe, type Recusa } from "@/lib/assinatura"

export type EstadoAssinatura = { erro?: Recusa | "falhou"; ok?: boolean }

/**
 * Grava a assinatura de QUEM ESTÁ PEDINDO.
 *
 * Sem parâmetro de usuário, de propósito. Uma Server Action é um endereço HTTP
 * como qualquer outro: se aceitasse `userId`, bastaria chamá-la direto para
 * trocar a assinatura de outra pessoa — e assinatura trocada é documento
 * assinado por quem não assinou. O alvo vem sempre da sessão.
 */
export async function salvarMinhaAssinatura(dataUri: string): Promise<EstadoAssinatura> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const recusa = conferirAssinatura(dataUri)
  if (recusa) return { erro: recusa }

  try {
    // REPROCESSA no servidor em vez de gravar o que veio.
    //
    // O desenho chega como bytes vindos do navegador. Passar pelo sharp
    // garante que o que fica guardado é um PNG de verdade, e não um arquivo
    // com outra coisa dentro — mesmo raciocínio do logo da empresa. O tamanho
    // também é normalizado aqui: assinatura enorme desalinha o rodapé do PDF.
    const { default: sharp } = await import("sharp")
    const entrada = sharp(Buffer.from(dataUri.split(",")[1], "base64"))

    // "É grande o suficiente para ser uma assinatura?" é pergunta sobre as
    // DIMENSÕES, e só dá para responder depois de decodificar. Media-se isto
    // por bytes antes, e bytes medem compressão: um traço simples e aparado
    // comprime tanto que assinatura legítima era recusada, e desenhar maior
    // não resolvia porque quase não muda o tamanho do arquivo.
    const { width, height } = await entrada.metadata()
    if (!dimensaoServe(width, height)) return { erro: "pequena" }

    const png = await entrada
      .resize({ width: 600, height: 200, fit: "inside", withoutEnlargement: true })
      // Fundo transparente preservado: a assinatura sai sobre o papel do PDF,
      // não sobre um retângulo branco por cima da linha.
      .png({ compressionLevel: 9 })
      .toBuffer()

    await prisma.user.update({
      where: { id: userId, tenantId },
      data: { signatureUrl: comoDataUri(png) },
    })
  } catch (err) {
    console.error("[assinatura] falha ao processar:", err)
    return { erro: "falhou" }
  }

  revalidatePath("/settings")
  return { ok: true }
}

/** Apaga a própria assinatura. Os documentos voltam a sair com a linha para
 *  assinar à mão — que é o comportamento de quem nunca desenhou. */
export async function apagarMinhaAssinatura(): Promise<EstadoAssinatura> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  await prisma.user.update({
    where: { id: userId, tenantId },
    data: { signatureUrl: null },
  })

  revalidatePath("/settings")
  return { ok: true }
}

/** A assinatura de quem está olhando, para a tela mostrar o que já está gravado. */
export async function minhaAssinatura(): Promise<string | null> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { signatureUrl: true },
  })
  return u?.signatureUrl ?? null
}
