"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"
import { aplicarMovimento, resolverLocal } from "@/lib/estoque-db"
import { quantidadeValida, UNIDADES, type TipoMovimento } from "@/lib/estoque"

export type EstadoPeca = { errors?: Record<string, string[]>; message?: string; ok?: boolean }

const pecaSchema = z.object({
  name: z.string().min(2, "nameRequired"),
  sku: z.string().optional(),
  unit: z.enum(UNIDADES),
  costPrice: z.string().optional(),
  salePrice: z.string().optional(),
  minStock: z.string().optional(),
})

const dinheiro = (v: string | undefined) => {
  if (!v || !v.trim()) return null
  // Aceita "12,50" e "12.50": o teclado do celular brasileiro dá vírgula.
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : null
}

const numero = (v: string | undefined) => {
  if (!v || !v.trim()) return 0
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function getPecas(busca?: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.part.findMany({
    where: {
      tenantId,
      ...(busca?.trim()
        ? {
            OR: [
              { name: { contains: busca.trim(), mode: "insensitive" as const } },
              { sku: { contains: busca.trim(), mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
}

/** Só as ativas, pra escolher num item de OS ou de compra. */
export async function getPecasAtivas() {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.part.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, sku: true, unit: true, stock: true, salePrice: true, costPrice: true },
    orderBy: { name: "asc" },
  })
}

export async function getPeca(id: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.part.findFirst({
    where: { id, tenantId },
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { name: true } },
          order: { select: { number: true, createdAt: true } },
          purchaseOrder: { select: { number: true } },
        },
      },
    },
  })
}

export async function salvarPeca(
  id: string | null,
  _prev: EstadoPeca,
  formData: FormData
): Promise<EstadoPeca> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  const tCommon = await getTranslations("common")
  // Preço de custo e de venda são informação comercial; técnico não mexe.
  if (role !== "OWNER" && role !== "ADMIN") return { message: tCommon("noPermission") }

  const parsed = pecaSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }
  const d = parsed.data

  const dados = {
    name: d.name.trim(),
    sku: d.sku?.trim() || null,
    unit: d.unit,
    costPrice: dinheiro(d.costPrice),
    salePrice: dinheiro(d.salePrice),
    minStock: numero(d.minStock),
  }

  if (id) {
    // where com tenantId: sem isso, um id de outra empresa seria editável.
    const existe = await prisma.part.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (!existe) return { message: tCommon("noPermission") }
    // `stock` fica de fora de propósito: saldo só muda por movimento.
    await prisma.part.update({ where: { id }, data: dados })
  } else {
    await prisma.part.create({ data: { ...dados, tenantId } })
  }

  revalidatePath("/parts")
  return { ok: true }
}

/**
 * Desativa em vez de apagar.
 *
 * Apagar quebraria movimentos e itens de OS já registrados — e o histórico do
 * estoque é justamente o que dá confiança no saldo.
 */
export async function alternarPeca(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  if (role !== "OWNER" && role !== "ADMIN") return

  const peca = await prisma.part.findFirst({ where: { id, tenantId }, select: { active: true } })
  if (!peca) return

  await prisma.part.update({ where: { id }, data: { active: !peca.active } })
  revalidatePath("/parts")
}

export type EstadoMovimento = { erro?: string; ok?: boolean }

/**
 * Movimento manual: entrada de compra avulsa, ajuste de inventário, baixa de
 * peça quebrada.
 */
export async function movimentar(
  _prev: EstadoMovimento,
  formData: FormData
): Promise<EstadoMovimento> {
  const { tenantId, userId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  // Movimentar estoque muda número que vira dinheiro no relatório. Técnico
  // consome peça pela OS, que é o caminho auditável — aqui é o dono.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const partId = String(formData.get("partId") ?? "")
  const tipo = String(formData.get("tipo") ?? "") as TipoMovimento
  if (!["ENTRADA", "SAIDA", "AJUSTE"].includes(tipo)) return { erro: "tipoInvalido" }

  const quantidade = Number(String(formData.get("quantidade") ?? "").replace(",", "."))
  if (!quantidadeValida(tipo, quantidade)) return { erro: "quantidadeInvalida" }

  const localEscolhido = String(formData.get("localId") ?? "") || null
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 200)
  // Ajuste sem motivo é indistinguível de erro seis meses depois.
  if (tipo === "AJUSTE" && !motivo) return { erro: "motivoObrigatorio" }

  try {
    await prisma.$transaction(async (tx) =>
      aplicarMovimento(tx, {
        tenantId,
        partId,
        // O local vem da tela. Vazio cai no padrão — a van de quem move,
        // quando ele tem uma; senão o almoxarifado.
        locationId: await resolverLocal(tx, tenantId, userId, localEscolhido),
        tipo,
        quantidade,
        motivo: motivo || null,
        userId,
      })
    )
  } catch {
    return { erro: "pecaNaoEncontrada" }
  }

  revalidatePath("/parts")
  return { ok: true }
}
