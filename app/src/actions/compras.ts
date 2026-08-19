"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { aplicarMovimento, proximoNumeroDeCompra } from "@/lib/estoque-db"
import { statusAposRecebimento, type ItemRecebido } from "@/lib/compras"

export type EstadoCompra = { erro?: string; ok?: boolean; id?: string }

async function contexto() {
  const { tenantId, userId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  return { tenantId, userId, role }
}

const numero = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

// ─── Fornecedores ────────────────────────────────────────────────────────────

export async function getFornecedores(busca?: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.supplier.findMany({
    where: {
      tenantId,
      ...(busca?.trim() ? { name: { contains: busca.trim(), mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
  })
}

export async function salvarFornecedor(
  id: string | null,
  _prev: EstadoCompra,
  formData: FormData
): Promise<EstadoCompra> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const nome = String(formData.get("name") ?? "").trim()
  if (nome.length < 2) return { erro: "nomeObrigatorio" }

  const dados = {
    name: nome.slice(0, 120),
    document: String(formData.get("document") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  }

  if (id) {
    const existe = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (!existe) return { erro: "semPermissao" }
    await prisma.supplier.update({ where: { id }, data: dados })
  } else {
    await prisma.supplier.create({ data: { ...dados, tenantId } })
  }

  revalidatePath("/purchases")
  return { ok: true }
}

export async function excluirFornecedor(id: string) {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return
  // O onDelete: SetNull da ordem de compra preserva o histórico: a compra
  // continua existindo, só perde o vínculo com um fornecedor que não existe
  // mais. Apagar em cascata destruiria o registro do que foi comprado.
  await prisma.supplier.deleteMany({ where: { id, tenantId } })
  revalidatePath("/purchases")
}

// ─── Ordens de compra ────────────────────────────────────────────────────────

export async function getCompras(status?: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(status && status !== "todas" ? { status: status as never } : {}),
    },
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

export async function getCompra(id: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: true,
      items: {
        include: { part: { select: { id: true, name: true, sku: true, unit: true, stock: true } } },
      },
    },
  })
}

type ItemEnviado = { partId: string; quantity: number; unitCost: number }

/** Lê os itens que a tela mandou como JSON. */
function lerItens(formData: FormData): ItemEnviado[] {
  try {
    const cru = JSON.parse(String(formData.get("itens") ?? "[]"))
    if (!Array.isArray(cru)) return []
    return cru
      .map((i) => ({
        partId: String(i?.partId ?? ""),
        quantity: Number(i?.quantity),
        unitCost: Number(i?.unitCost),
      }))
      .filter(
        (i) =>
          i.partId &&
          Number.isFinite(i.quantity) &&
          i.quantity > 0 &&
          Number.isFinite(i.unitCost) &&
          i.unitCost >= 0
      )
  } catch {
    return []
  }
}

export async function criarCompra(_prev: EstadoCompra, formData: FormData): Promise<EstadoCompra> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const itens = lerItens(formData)
  if (itens.length === 0) return { erro: "semItens" }

  // Toda peça precisa ser DESTA empresa. Sem esta checagem, um partId de outra
  // empresa entraria na compra e, no recebimento, movimentaria estoque alheio.
  const validas = await prisma.part.findMany({
    where: { tenantId, id: { in: itens.map((i) => i.partId) } },
    select: { id: true },
  })
  const conhecidas = new Set(validas.map((p) => p.id))
  if (itens.some((i) => !conhecidas.has(i.partId))) return { erro: "pecaInvalida" }

  const supplierId = String(formData.get("supplierId") ?? "") || null
  if (supplierId) {
    const forn = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    })
    if (!forn) return { erro: "fornecedorInvalido" }
  }

  const expectedAtRaw = String(formData.get("expectedAt") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null
  const total = itens.reduce((s, i) => s + i.quantity * i.unitCost, 0)

  const criada = await prisma.$transaction(async (tx) => {
    const number = await proximoNumeroDeCompra(tx, tenantId)
    return tx.purchaseOrder.create({
      data: {
        tenantId,
        number,
        supplierId,
        status: "ENVIADA",
        expectedAt: expectedAtRaw ? new Date(`${expectedAtRaw}T12:00:00`) : null,
        notes,
        total,
        items: {
          create: itens.map((i) => ({
            partId: i.partId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            total: Math.round(i.quantity * i.unitCost * 100) / 100,
          })),
        },
      },
      select: { id: true },
    })
  })

  revalidatePath("/purchases")
  return { ok: true, id: criada.id }
}

/**
 * Recebe (total ou parcialmente) uma ordem de compra.
 *
 * Cada item recebido vira ENTRADA no estoque, na MESMA transação em que o
 * recebido do item é atualizado. Se metade gravasse e a outra não, o estoque
 * passaria a mentir — e estoque que mente é pior que estoque nenhum, porque
 * ninguém desconfia dele.
 *
 * O custo da peça é atualizado com o que foi pago agora: é o número que
 * interessa pra saber a margem do próximo serviço.
 */
export async function receberCompra(
  id: string,
  _prev: EstadoCompra,
  formData: FormData
): Promise<EstadoCompra> {
  const { tenantId, userId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const compra = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: { items: true },
  })
  if (!compra) return { erro: "naoEncontrada" }
  if (compra.status === "CANCELADA") return { erro: "compraCancelada" }
  if (compra.status === "RECEBIDA") return { erro: "jaRecebida" }

  // Quanto chegou de cada item, vindo de um campo por item na tela.
  const chegou = new Map<string, number>()
  for (const item of compra.items) {
    const q = numero(formData.get(`recebido_${item.id}`))
    if (q > 0) chegou.set(item.id, q)
  }
  if (chegou.size === 0) return { erro: "nadaARecebeber" }

  const paraStatus: ItemRecebido[] = compra.items.map((i) => ({
    pedido: Number(i.quantity),
    recebido: Number(i.receivedQuantity) + (chegou.get(i.id) ?? 0),
  }))
  const novoStatus = statusAposRecebimento(paraStatus)

  await prisma.$transaction(async (tx) => {
    for (const item of compra.items) {
      const q = chegou.get(item.id)
      if (!q) continue

      await tx.purchaseItem.update({
        where: { id: item.id },
        data: { receivedQuantity: Number(item.receivedQuantity) + q },
      })
      await aplicarMovimento(tx, {
        tenantId,
        partId: item.partId,
        tipo: "ENTRADA",
        quantidade: q,
        motivo: `Compra #${compra.number}`,
        purchaseOrderId: compra.id,
        userId,
      })
      // Custo mais recente é o que vale pra calcular margem daqui pra frente.
      await tx.part.update({
        where: { id: item.partId },
        data: { costPrice: item.unitCost },
      })
    }

    await tx.purchaseOrder.update({
      where: { id: compra.id },
      data: {
        status: novoStatus,
        receivedAt: novoStatus === "RECEBIDA" ? new Date() : compra.receivedAt,
      },
    })
  })

  revalidatePath("/purchases")
  revalidatePath("/parts")
  return { ok: true }
}

export async function cancelarCompra(id: string) {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return

  const compra = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    select: { status: true },
  })
  if (!compra) return
  // Compra já recebida não se cancela: o estoque já entrou, e desfazer daqui
  // deixaria saldo e histórico discordando. Para devolver ao fornecedor, o
  // caminho é um movimento de saída, que fica registrado como tal.
  if (compra.status === "RECEBIDA" || compra.status === "PARCIAL") return

  await prisma.purchaseOrder.update({ where: { id }, data: { status: "CANCELADA" } })
  revalidatePath("/purchases")
}
