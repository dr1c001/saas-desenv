"use server"

import { cache } from "react"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import {
  lerOpcoes,
  validarDefinicao,
  MAX_CAMPOS_POR_ENTIDADE,
  type DefinicaoCampo,
} from "@/lib/custom-fields"
import type { CustomFieldEntity, CustomFieldType } from "@/generated/prisma/client"

export type EstadoCampo = { erro?: string; ok?: boolean }

// Memoizado por requisição: o formulário de cliente e a página de detalhe
// pedem as mesmas definições, e sem isto seria uma consulta a cada chamada.
export const getCustomFields = cache(async function getCustomFields(
  entity: CustomFieldEntity
): Promise<DefinicaoCampo[]> {
  const { tenantId } = await getTenant()
  const campos = await prisma.customField.findMany({
    where: { tenantId, entity },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, type: true, options: true, required: true },
  })
  return campos.map((c) => ({ ...c, type: c.type as DefinicaoCampo["type"] }))
})

async function exigirGestor() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Definir a estrutura do cadastro é decisão da empresa, não de quem está em
  // campo: um técnico não deveria conseguir apagar um campo que já tem valor
  // preenchido em centenas de clientes.
  if (role !== "OWNER" && role !== "ADMIN") return null
  return tenantId
}

export async function createCustomField(
  _prev: EstadoCampo,
  formData: FormData
): Promise<EstadoCampo> {
  const tenantId = await exigirGestor()
  if (!tenantId) return { erro: "semPermissao" }

  const entity = String(formData.get("entity") ?? "") as CustomFieldEntity
  if (entity !== "CLIENT" && entity !== "SERVICE_ORDER") return { erro: "entidadeInvalida" }

  const label = String(formData.get("label") ?? "")
  const type = String(formData.get("type") ?? "TEXT")
  const options = lerOpcoes(String(formData.get("options") ?? ""))

  const problema = validarDefinicao({ label, type, options })
  if (problema) return { erro: problema }

  // Teto por entidade: formulário com 200 campos personalizados não é
  // configuração, é acidente — e a tela de cadastro fica inutilizável.
  const total = await prisma.customField.count({ where: { tenantId, entity } })
  if (total >= MAX_CAMPOS_POR_ENTIDADE) return { erro: "limiteAtingido" }

  await prisma.customField.create({
    data: {
      tenantId,
      entity,
      label: label.trim(),
      type: type as CustomFieldType,
      options: type === "SELECT" ? options : [],
      required: formData.get("required") === "on",
      position: total,
    },
  })

  revalidatePath("/settings/fields")
  return { ok: true }
}

export async function deleteCustomField(id: string): Promise<EstadoCampo> {
  const tenantId = await exigirGestor()
  if (!tenantId) return { erro: "semPermissao" }

  // deleteMany com tenantId no where, não delete por id: delete por id sozinho
  // apagaria campo de outra empresa se o id vazasse.
  const { count } = await prisma.customField.deleteMany({ where: { id, tenantId } })
  if (count === 0) return { erro: "naoEncontrado" }

  // Os valores já gravados continuam no Json dos registros, mas param de
  // aparecer: a exibição percorre as definições, não as chaves do Json. Isso é
  // proposital — se o campo for recriado por engano, nada foi perdido.
  revalidatePath("/settings/fields")
  revalidatePath("/clients")
  return { ok: true }
}

export async function moveCustomField(id: string, direcao: "up" | "down"): Promise<EstadoCampo> {
  const tenantId = await exigirGestor()
  if (!tenantId) return { erro: "semPermissao" }

  const campo = await prisma.customField.findFirst({ where: { id, tenantId } })
  if (!campo) return { erro: "naoEncontrado" }

  const irmaos = await prisma.customField.findMany({
    where: { tenantId, entity: campo.entity },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  })

  const atual = irmaos.findIndex((c) => c.id === id)
  const destino = direcao === "up" ? atual - 1 : atual + 1
  if (destino < 0 || destino >= irmaos.length) return { ok: true } // já está na ponta

  const reordenados = [...irmaos]
  const [movido] = reordenados.splice(atual, 1)
  reordenados.splice(destino, 0, movido)

  // Regrava a posição de todos: `position` pode ter vindo duplicada ou com
  // buracos de criações e remoções anteriores, e reescrever a sequência inteira
  // é o que garante que a ordem exibida bate com a ordem gravada.
  await prisma.$transaction(
    reordenados.map((c, i) =>
      prisma.customField.update({ where: { id: c.id }, data: { position: i } })
    )
  )

  revalidatePath("/settings/fields")
  return { ok: true }
}
