"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { gerarChave, mascarar } from "@/lib/api-chave"

export type ChaveNaTela = {
  id: string
  name: string
  mascarada: string
  criadaEm: string
  ultimoUso: string | null
  revogadaEm: string | null
}

export type EstadoDaChave =
  | { erro: "semPermissao" | "semPlano" | "nomeVazio" | "limite" }
  | { ok: true; chave: string }

/** Teto de chaves ativas. Não é limite de plano: é higiene. Chave que ninguém
 *  lembra de ter criado é chave que ninguém lembra de revogar. */
const MAX_ATIVAS = 5

export async function listarChaves(): Promise<ChaveNaTela[]> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const chaves = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true, createdAt: true,
      lastUsedAt: true, revokedAt: true,
    },
  })

  return chaves.map((c) => ({
    id: c.id,
    name: c.name,
    // Nunca a chave: o banco não tem a chave para devolver, e é esse o ponto.
    mascarada: mascarar(c.prefix),
    criadaEm: c.createdAt.toISOString(),
    ultimoUso: c.lastUsedAt?.toISOString() ?? null,
    revogadaEm: c.revokedAt?.toISOString() ?? null,
  }))
}

/**
 * Cria uma chave e devolve o texto dela — a ÚNICA vez que ele existe fora do
 * navegador de quem pediu. Depois disso o banco só tem o hash, e nem nós
 * conseguimos reexibir.
 */
export async function criarChave(nome: string): Promise<EstadoDaChave> {
  const { tenantId, role, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  // Chave de API dá acesso de leitura e escrita à base inteira da empresa.
  // Criar uma não é tarefa de técnico.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }
  if (!(await temRecurso(tenantId, "api"))) return { erro: "semPlano" }

  const limpo = nome.trim().slice(0, 60)
  if (!limpo) return { erro: "nomeVazio" }

  const ativas = await prisma.apiKey.count({ where: { tenantId, revokedAt: null } })
  if (ativas >= MAX_ATIVAS) return { erro: "limite" }

  const { chave, prefixo, hash } = gerarChave()
  await prisma.apiKey.create({
    data: { tenantId, name: limpo, prefix: prefixo, hash, createdBy: userId },
  })

  revalidatePath("/settings/api")
  return { ok: true, chave }
}

/**
 * Revoga. Marca em vez de apagar, de propósito: quando a integração de alguém
 * parar de funcionar, a pergunta vai ser "quem desligou e quando" — e uma
 * linha apagada não responde nada.
 */
export async function revogarChave(id: string): Promise<{ erro?: "semPermissao" }> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  // updateMany com tenantId no filtro: com update por id, um id de outra
  // empresa desligaria a integração dela.
  await prisma.apiKey.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  revalidatePath("/settings/api")
  return {}
}
