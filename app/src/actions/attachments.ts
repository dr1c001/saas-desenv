"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import {
  caminhoDaFoto,
  caminhoPertenceAoTenant,
  MAX_FOTOS_POR_OS,
  validarFoto,
} from "@/lib/foto"
import { apagarArquivo, enviarArquivo, linkTemporario } from "@/lib/storage"

export type EstadoFoto = { erro?: string; ok?: boolean }

/**
 * Confere que a OS é mesmo da empresa de quem está pedindo.
 *
 * Server Action é endpoint HTTP: o id da OS chega do formulário e pode ser
 * qualquer coisa. Sem isto, alguém anexaria foto na OS de outra empresa — ou
 * pior, leria as de lá.
 */
async function osDoTenant(orderId: string, tenantId: string) {
  return prisma.serviceOrder.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, status: true },
  })
}

export async function enviarFotoDaOs(
  _prev: EstadoFoto,
  formData: FormData
): Promise<EstadoFoto> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const orderId = String(formData.get("orderId") ?? "")
  const arquivo = formData.get("foto")
  if (!(arquivo instanceof File)) return { erro: "arquivoVazio" }

  const os = await osDoTenant(orderId, tenantId)
  if (!os) return { erro: "osNaoEncontrada" }

  // Anexar foto em OS já faturada mexeria no documento que sustenta uma nota
  // fiscal emitida — mesma regra que já vale pra editar a OS.
  if (os.status === "INVOICED") return { erro: "osFaturada" }

  const jaTem = await prisma.attachment.count({ where: { orderId } })
  const problema = validarFoto({ type: arquivo.type, size: arquivo.size }, jaTem)
  if (problema) return { erro: problema }

  const fotoId = randomUUID()
  const caminho = caminhoDaFoto(tenantId, orderId, fotoId, arquivo.type)

  await enviarArquivo(caminho, Buffer.from(await arquivo.arrayBuffer()), arquivo.type)

  // Só grava a linha DEPOIS do upload dar certo: linha sem arquivo viraria
  // uma foto quebrada na tela, sem jeito de o usuário se livrar dela.
  await prisma.attachment.create({
    data: { id: fotoId, orderId, url: caminho, name: arquivo.name.slice(0, 120) },
  })

  revalidatePath(`/service-orders/${orderId}`)
  return { ok: true }
}

export async function apagarFotoDaOs(fotoId: string): Promise<EstadoFoto> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)

  // Técnico anexa foto em campo (fluxo legítimo), mas apagar prova de serviço
  // prestado é outra coisa — depois de uma discussão com o cliente, é
  // exatamente o que alguém teria interesse em fazer.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const foto = await prisma.attachment.findFirst({
    where: { id: fotoId, order: { tenantId } },
    select: { id: true, url: true, orderId: true },
  })
  if (!foto) return { erro: "naoEncontrada" }
  if (!caminhoPertenceAoTenant(foto.url, tenantId)) return { erro: "naoEncontrada" }

  await prisma.attachment.delete({ where: { id: foto.id } })
  await apagarArquivo(foto.url)

  revalidatePath(`/service-orders/${foto.orderId}`)
  return { ok: true }
}

export type FotoExibicao = { id: string; link: string | null }

/**
 * Fotos de uma OS, já com link temporário pronto pra exibir.
 *
 * Os links são gerados em paralelo: com 10 fotos, em série seriam 10 idas ao
 * Supabase somadas antes de a página aparecer.
 */
export async function getFotosDaOs(orderId: string): Promise<FotoExibicao[]> {
  const { tenantId } = await getTenant()

  const fotos = await prisma.attachment.findMany({
    where: { orderId, order: { tenantId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true },
    take: MAX_FOTOS_POR_OS,
  })

  return Promise.all(
    fotos.map(async (f) => ({
      id: f.id,
      link: caminhoPertenceAoTenant(f.url, tenantId) ? await linkTemporario(f.url) : null,
    }))
  )
}
