"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { aplicarMovimento, proximoNumeroDeCompra, resolverLocal } from "@/lib/estoque-db"
import { custoDoRecebimento, statusAposRecebimento, type ItemRecebido } from "@/lib/compras"
import { lerDinheiro } from "@/lib/dinheiro"
import { custoMedio, dividirEmParcelas, sugerirCompra } from "@/lib/compras-dinheiro"

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

// Os FORNECEDORES mudaram de casa: actions/fornecedores.ts.
//
// Eles moravam aqui porque so existiam dentro da tela de Compras — um dialogo
// onde so dava para criar e apagar. Agora tem tela propria (4.6), sao usados
// por compra E por cotacao, e tem ciclo de vida proprio (ativo/inativo).
// Manter uma copia aqui faria as duas divergirem.

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
    include: { items: true, supplier: { select: { name: true } } },
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

  // ─── Nada entra valendo ZERO ──────────────────────────────────────────────
  //
  // A ordem gerada por "Comprar o que falta" nasce com o último custo conhecido
  // da peça, e peça nunca comprada não tem custo — a linha vinha R$ 0,00.
  // Receber assim derrubava o custo médio da peça E não criava despesa nenhuma:
  // a peça entrava no estoque e o dinheiro não saía do caixa.
  //
  // O preço se sabe AQUI, com a nota do fornecedor na mão. O campo só aparece
  // para a linha zerada, e o custo já gravado nunca é sobrescrito.
  const custos = new Map<string, number>()
  for (const item of compra.items) {
    if (!chegou.has(item.id)) continue
    const custo = custoDoRecebimento(
      Number(item.unitCost),
      lerDinheiro(formData.get(`custo_${item.id}`))
    )
    if (custo <= 0) return { erro: "custoZerado" }
    custos.set(item.id, custo)
  }

  const paraStatus: ItemRecebido[] = compra.items.map((i) => ({
    pedido: Number(i.quantity),
    recebido: Number(i.receivedQuantity) + (chegou.get(i.id) ?? 0),
  }))
  const novoStatus = statusAposRecebimento(paraStatus)

  // ─── O que vira despesa, e quando vence ───────────────────────────────────
  //
  // O valor é o do que chegou AGORA, e não o total da ordem: numa compra
  // parcial paga-se o que foi entregue, e lançar o total inteiro registraria
  // dinheiro que ainda não saiu.
  // Usa o custo RESOLVIDO (o gravado, ou o informado agora para a linha
  // zerada), senão a despesa continuaria saindo zero justamente no caso que
  // este conserto existe para cobrir.
  const valorRecebidoAgora = compra.items.reduce(
    (soma, i) => soma + (chegou.get(i.id) ?? 0) * (custos.get(i.id) ?? Number(i.unitCost)),
    0
  )

  // Prazo e parcelas vêm da tela do recebimento — é ali que se sabe o que foi
  // combinado com o fornecedor. Sem informar, vence hoje em uma parcela, que é
  // o comportamento de quem paga à vista.
  const parcelas = Math.max(1, Math.floor(numero(formData.get("parcelas")) || 1))
  const vencimentoCru = String(formData.get("primeiroVencimento") ?? "").trim()
  const primeiroVencimento = vencimentoCru
    ? // Meio-dia evita o vencimento escorregar um dia para trás no fuso.
      new Date(`${vencimentoCru}T12:00:00`)
    : new Date()

  const fornecedor = compra.supplier?.name ?? null

  await prisma.$transaction(async (tx) => {
    for (const item of compra.items) {
      const q = chegou.get(item.id)
      if (!q) continue

      const custo = custos.get(item.id) ?? Number(item.unitCost)

      await tx.purchaseItem.update({
        where: { id: item.id },
        data: {
          receivedQuantity: Number(item.receivedQuantity) + q,
          // O preço informado no recebimento fica GRAVADO na linha. Sem isto a
          // ordem continuaria mostrando R$ 0,00 depois de recebida, e o total
          // dela nunca bateria com a despesa que ela gerou.
          unitCost: custo,
          total: Math.round(Number(item.quantity) * custo * 100) / 100,
        },
      })
      await aplicarMovimento(tx, {
        tenantId,
        partId: item.partId,
        // A peça comprada chega no DEPÓSITO, e não na van de quem registrou o
        // recebimento — por isso o local é resolvido sem usuário: `localPadrao`
        // sem pessoa cai no almoxarifado.
        locationId: await resolverLocal(tx, tenantId, null),
        tipo: "ENTRADA",
        quantidade: q,
        motivo: `Compra #${compra.number}`,
        purchaseOrderId: compra.id,
        userId,
      })
      // Custo MÉDIO PONDERADO, e não a última nota.
      //
      // Sobrescrever com o preço da última compra fazia 10 peças a R$ 80 mais
      // 2 a R$ 120 passarem a valer R$ 120 cada — e a margem de todo serviço
      // seguinte aparecia menor do que é, calculada sobre um estoque que
      // custou outra coisa. Regra e casos de borda em lib/compras-dinheiro.ts.
      //
      // Lido DENTRO da transação e antes do movimento ter sido aplicado à
      // linha: `saldoAntes` é o estoque que existia quando este custo valia.
      const antes = await tx.part.findUnique({
        where: { id: item.partId },
        select: { stock: true, costPrice: true },
      })
      await tx.part.update({
        where: { id: item.partId },
        data: {
          costPrice: custoMedio({
            // O movimento acima já somou `q` ao estoque, então o saldo de
            // antes é o atual menos o que acabou de entrar.
            estoqueAtual: Number(antes?.stock ?? 0) - q,
            custoAtual: antes?.costPrice ? Number(antes.costPrice) : null,
            quantidadeRecebida: q,
            custoDaCompra: custo,
          }),
        },
      })
    }

    await tx.purchaseOrder.update({
      where: { id: compra.id },
      data: {
        status: novoStatus,
        receivedAt: novoStatus === "RECEBIDA" ? new Date() : compra.receivedAt,
      },
    })

    // ─── A COMPRA VIRA DESPESA ─────────────────────────────────────────────
    //
    // Era o defeito mais caro deste módulo: a peça entrava no estoque e o
    // dinheiro não saía do caixa. A empresa comprava R$ 2.400, o saldo subia,
    // e o Financeiro não ficava sabendo — o lucro na tela ficava maior que o
    // lucro de verdade.
    //
    // A despesa é por RECEBIMENTO, e pelo valor do que chegou AGORA: numa
    // compra parcial paga-se o que foi entregue, e uma despesa só, do total,
    // lançaria dinheiro que ainda não saiu.
    //
    // Na MESMA transação do estoque: se uma gravasse e a outra não, estoque e
    // caixa passariam a discordar sem ninguém notar.
    if (valorRecebidoAgora > 0) {
      for (const p of dividirEmParcelas(valorRecebidoAgora, parcelas, primeiroVencimento)) {
        await tx.expense.create({
          data: {
            tenantId,
            description:
              `Compra #${compra.number}` +
              (compra.supplierId && fornecedor ? ` — ${fornecedor}` : "") +
              (parcelas > 1 ? ` (${p.numero}/${parcelas})` : ""),
            amount: p.valor,
            dueDate: p.vencimento,
            // Peça é custo que varia com o volume de serviço — não é aluguel.
            category: "VARIABLE",
            purchaseOrderId: compra.id,
          },
        })
      }
    }
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

// ─── Sugestão de compra ──────────────────────────────────────────────────────

/**
 * O que está abaixo do mínimo, e quanto falta comprar.
 *
 * O sistema já sabia disso — o alerta da tela de peças usa a mesma informação
 * todo dia. O que faltava era transformar esse conhecimento numa ordem de
 * compra, em vez de deixar o dono somar à mão o que precisa pedir.
 */
export async function getSugestaoDeCompra() {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")

  const pecas = await prisma.part.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, stock: true, minStock: true, costPrice: true },
  })

  return sugerirCompra(
    pecas.map((p) => ({
      id: p.id,
      nome: p.name,
      estoque: Number(p.stock),
      minimo: Number(p.minStock),
      custo: p.costPrice ? Number(p.costPrice) : null,
    }))
  )
}

/**
 * Cria uma ordem de compra em RASCUNHO com o que está faltando.
 *
 * Rascunho, e não enviada: o dono ainda vai escolher o fornecedor, conferir as
 * quantidades e negociar o preço. Criar já enviada seria o sistema comprando
 * sozinho.
 *
 * O custo do item vem do custo médio da peça — é a melhor estimativa que
 * existe antes de o fornecedor responder. Peça sem custo entra com zero, e a
 * tela mostra o campo vazio para ser preenchido.
 */
export async function criarCompraSugerida(): Promise<EstadoCompra> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const sugestao = await getSugestaoDeCompra()
  if (sugestao.length === 0) return { erro: "nadaAComprar" }

  const criada = await prisma.$transaction(async (tx) => {
    const number = await proximoNumeroDeCompra(tx, tenantId)
    return tx.purchaseOrder.create({
      data: {
        tenantId,
        number,
        status: "RASCUNHO",
        total: sugestao.reduce((s, p) => s + p.comprar * (p.custo ?? 0), 0),
        items: {
          create: sugestao.map((p) => ({
            partId: p.id,
            quantity: p.comprar,
            unitCost: p.custo ?? 0,
            total: Math.round(p.comprar * (p.custo ?? 0) * 100) / 100,
          })),
        },
      },
      select: { id: true },
    })
  })

  revalidatePath("/purchases")
  return { ok: true, id: criada.id }
}
