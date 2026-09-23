"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { chaveValida, TIPOS_CHAVE, type TipoChavePix } from "@/lib/pix"

export type EstadoPix = { erro?: string; ok?: boolean }

export type ConfigPix = {
  pixKey: string | null
  pixKeyType: TipoChavePix | null
  pixReceiver: string | null
  pixCity: string | null
}

function tipo(valor: unknown): TipoChavePix | null {
  return TIPOS_CHAVE.includes(valor as TipoChavePix) ? (valor as TipoChavePix) : null
}

export async function getPix(): Promise<ConfigPix> {
  const { tenantId } = await getTenant()
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { pixKey: true, pixKeyType: true, pixReceiver: true, pixCity: true, name: true },
  })
  return {
    pixKey: t?.pixKey ?? null,
    pixKeyType: tipo(t?.pixKeyType),
    // Sugere o nome da empresa quando ainda não configurou — na maioria dos
    // casos o titular da conta é ela mesma.
    pixReceiver: t?.pixReceiver ?? t?.name ?? null,
    pixCity: t?.pixCity ?? null,
  }
}

export async function salvarPix(_prev: EstadoPix, formData: FormData): Promise<EstadoPix> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // É a conta pra onde o dinheiro dos clientes vai. Quem troca isso é o dono.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const texto = (nome: string) => String(formData.get(nome) ?? "").trim()
  const chave = texto("pixKey")
  const tipoChave = tipo(texto("pixKeyType"))
  const recebedor = texto("pixReceiver")
  const cidade = texto("pixCity")

  // Limpar a chave desliga a cobrança por PIX. Some do documento, nada quebra.
  if (chave === "") {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { pixKey: null, pixKeyType: null, pixReceiver: null, pixCity: null },
    })
    revalidatePath("/settings")
    return { ok: true }
  }

  if (!tipoChave) return { erro: "tipoInvalido" }
  // Validar aqui, e não só na tela: chave errada gera um código que o app do
  // banco recusa, e quem descobre é o cliente final na hora de pagar — longe
  // de quem digitou e sem saber a quem reclamar.
  if (!chaveValida(chave, tipoChave)) return { erro: "chaveInvalida" }
  if (recebedor === "") return { erro: "recebedorObrigatorio" }
  if (cidade === "") return { erro: "cidadeObrigatoria" }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      pixKey: chave.slice(0, 120),
      pixKeyType: tipoChave,
      pixReceiver: recebedor.slice(0, 120),
      pixCity: cidade.slice(0, 60),
    },
  })

  revalidatePath("/settings")
  return { ok: true }
}
