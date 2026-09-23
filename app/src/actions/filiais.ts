"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { filialValida } from "@/lib/filial"

export type FilialNaTela = {
  id: string
  name: string
  active: boolean
  pessoas: number
  clientes: number
}

export type EstadoDaFilial = { erro?: "semPermissao" | "semPlano" | "nomeVazio" | "naoEncontrada" }

async function exigirDono() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Mexer em filial redesenha quem enxerga o quê na empresa inteira. Não é
  // tarefa de técnico.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" as const }
  if (!(await temRecurso(tenantId, "filiais"))) return { erro: "semPlano" as const }
  return { tenantId }
}

export async function listarFiliais(): Promise<FilialNaTela[]> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const filiais = await prisma.branch.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, active: true,
      // Os números respondem a pergunta que a pessoa faz antes de desativar:
      // "quem fica sem lugar se eu tirar esta?"
      _count: { select: { users: true, clients: true } },
    },
  })

  return filiais.map((f) => ({
    id: f.id,
    name: f.name,
    active: f.active,
    pessoas: f._count.users,
    clientes: f._count.clients,
  }))
}

/** As filiais ativas, para os seletores. */
export async function filiaisAtivas(): Promise<{ id: string; name: string }[]> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (!(await temRecurso(tenantId, "filiais"))) return []
  return prisma.branch.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

export async function criarFilial(nome: string): Promise<EstadoDaFilial> {
  const guarda = await exigirDono()
  if ("erro" in guarda) return guarda

  const limpo = nome.trim().slice(0, 80)
  if (!limpo) return { erro: "nomeVazio" }

  await prisma.branch.create({ data: { tenantId: guarda.tenantId, name: limpo } })
  revalidatePath("/settings/filiais")
  revalidatePath("/")
  return {}
}

export async function renomearFilial(id: string, nome: string): Promise<EstadoDaFilial> {
  const guarda = await exigirDono()
  if ("erro" in guarda) return guarda

  const limpo = nome.trim().slice(0, 80)
  if (!limpo) return { erro: "nomeVazio" }

  // updateMany com tenantId: com update por id, um id de outra empresa
  // renomearia a filial dela.
  const r = await prisma.branch.updateMany({
    where: { id, tenantId: guarda.tenantId },
    data: { name: limpo },
  })
  if (r.count === 0) return { erro: "naoEncontrada" }

  revalidatePath("/settings/filiais")
  return {}
}

/**
 * Liga e desliga.
 *
 * **Desativa, não apaga.** Apagar levaria junto o vínculo de todo cliente, OS
 * e receita daquela unidade — o registro voltaria a "sem filial" e o
 * faturamento por unidade do ano inteiro sumiria, por causa de um clique de
 * organização. Desativada, a filial some dos seletores e para de receber
 * registro novo, e o histórico continua inteiro.
 */
export async function alternarFilial(id: string): Promise<EstadoDaFilial> {
  const guarda = await exigirDono()
  if ("erro" in guarda) return guarda

  const atual = await prisma.branch.findFirst({
    where: { id, tenantId: guarda.tenantId },
    select: { active: true },
  })
  if (!atual) return { erro: "naoEncontrada" }

  await prisma.branch.updateMany({
    where: { id, tenantId: guarda.tenantId },
    data: { active: !atual.active },
  })

  revalidatePath("/settings/filiais")
  revalidatePath("/")
  return {}
}

/**
 * Vincula uma pessoa a uma filial, ou solta ela (`null`).
 *
 * Soltar não é falta de configuração: quem não tem filial vê tudo, e é assim
 * que a matriz e o dono trabalham.
 */
export async function vincularPessoa(userId: string, filialId: string | null): Promise<EstadoDaFilial> {
  const guarda = await exigirDono()
  if ("erro" in guarda) return guarda

  // A filial escolhida precisa ser ATIVA e desta empresa. Sem conferir, um id
  // vindo do formulário viraria o branchId da pessoa — inclusive o id de uma
  // filial de outra empresa, e aí ela sumiria das telas das duas.
  const ativas = await prisma.branch.findMany({
    where: { tenantId: guarda.tenantId, active: true },
    select: { id: true },
  })
  const destino = filialValida(filialId, ativas.map((f) => f.id))

  const r = await prisma.user.updateMany({
    where: { id: userId, tenantId: guarda.tenantId },
    data: { branchId: destino },
  })
  if (r.count === 0) return { erro: "naoEncontrada" }

  revalidatePath("/settings/filiais")
  revalidatePath("/team")
  revalidatePath("/")
  return {}
}

/** A equipe com a filial de cada um, para a tela de vínculo. */
export async function equipeComFilial() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, branchId: true },
  })
}
