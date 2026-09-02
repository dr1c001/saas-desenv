"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { proximoNumeroDeCompra } from "@/lib/estoque-db"
import {
  aceitaPreco,
  compararCotacao,
  podeFecharCom,
  totaisPorFornecedor,
  type ItemCotado,
  type Participante,
  type PrecoCotado,
} from "@/lib/cotacao"

// Cotação entre fornecedores.
//
// Responde "de quem eu compro", que a ordem de compra não responde. Toda export
// aqui é endereço HTTP despachável, e cada uma refaz as três checagens
// (assinatura, recurso, papel) por conta própria.

export type EstadoCotacao = { erro?: string; ok?: boolean; id?: string }

async function contexto() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Cotação é parte de comprar; herda a trava do estoque, que é Pro+.
  await requireRecurso(tenantId, "stock")
  return { tenantId, role }
}

const ehAdmin = (role: string) => role === "OWNER" || role === "ADMIN"

const numero = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

export async function getCotacoes(status?: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.quotation.findMany({
    where: { tenantId, ...(status && status !== "todas" ? { status: status as never } : {}) },
    include: {
      _count: { select: { items: true, participants: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

export async function getCotacao(id: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  return prisma.quotation.findFirst({
    where: { id, tenantId },
    include: {
      items: { include: { part: { select: { name: true, unit: true } } }, orderBy: { id: "asc" } },
      participants: {
        include: { supplier: { select: { name: true } }, prices: true },
        orderBy: { id: "asc" },
      },
    },
  })
}

/**
 * A comparação, pronta para a tela.
 *
 * Monta as três listas que `compararCotacao` pede a partir do que veio do
 * banco. A regra em si (quem ganha, quanto se economiza) mora em lib/cotacao.ts
 * e é testada lá — aqui é só tradução de formato.
 */
export async function getComparacao(id: string) {
  const c = await getCotacao(id)
  if (!c) return null

  const itens: ItemCotado[] = c.items.map((i) => ({
    id: i.id,
    partId: i.partId,
    nome: i.part.name,
    quantidade: Number(i.quantity),
  }))
  const participantes: Participante[] = c.participants.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    nome: p.supplier.name,
  }))
  const precos: PrecoCotado[] = c.participants.flatMap((p) =>
    p.prices.map((x) => ({
      participantId: p.id,
      itemId: x.itemId,
      unitPrice: Number(x.unitPrice),
    }))
  )

  return { cotacao: c, comparacao: compararCotacao(itens, participantes, precos) }
}

/** O próximo número de cotação da empresa. Mesma lógica sem lock da compra. */
async function proximoNumero(tenantId: string) {
  const ultima = await prisma.quotation.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (ultima?.number ?? 0) + 1
}

export async function criarCotacao(
  _prev: EstadoCotacao,
  formData: FormData
): Promise<EstadoCotacao> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const title = String(formData.get("title") ?? "").trim().slice(0, 160)
  if (title.length < 2) return { erro: "tituloObrigatorio" }

  const partIds = formData.getAll("partId").map(String).filter(Boolean)
  const quantidades = formData.getAll("quantidade").map((q) => numero(q))
  const supplierIds = formData.getAll("supplierId").map(String).filter(Boolean)

  if (partIds.length === 0) return { erro: "semItens" }
  if (supplierIds.length === 0) return { erro: "semFornecedores" }

  // Peças e fornecedores TÊM de ser desta empresa: ids vindos do formulário
  // criariam uma cotação com peça alheia, e a compra gerada no fim mexeria no
  // estoque de outra empresa.
  const [pecas, fornecedores] = await Promise.all([
    prisma.part.findMany({ where: { tenantId, id: { in: partIds } }, select: { id: true } }),
    prisma.supplier.findMany({
      where: { tenantId, id: { in: supplierIds } },
      select: { id: true },
    }),
  ])
  const pecasOk = new Set(pecas.map((p) => p.id))
  const fornOk = new Set(fornecedores.map((f) => f.id))
  if (partIds.some((p) => !pecasOk.has(p))) return { erro: "pecaInvalida" }
  if (supplierIds.some((f) => !fornOk.has(f))) return { erro: "fornecedorInvalido" }

  // Peça repetida faria a comparação contar em dobro. A unicidade no banco
  // recusaria, mas com um erro que não diz nada ao usuário.
  const itens = new Map<string, number>()
  partIds.forEach((id, i) => {
    const q = quantidades[i] ?? 0
    if (q > 0) itens.set(id, (itens.get(id) ?? 0) + q)
  })
  if (itens.size === 0) return { erro: "quantidadeInvalida" }

  const deadlineCru = String(formData.get("deadline") ?? "").trim()

  const criada = await prisma.quotation.create({
    data: {
      tenantId,
      number: await proximoNumero(tenantId),
      title,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
      // Meio-dia evita o prazo escorregar um dia para trás no fuso.
      deadline: deadlineCru ? new Date(`${deadlineCru}T12:00:00`) : null,
      items: {
        create: [...itens].map(([partId, quantity]) => ({ partId, quantity })),
      },
      participants: {
        create: [...new Set(supplierIds)].map((supplierId) => ({ supplierId })),
      },
    },
    select: { id: true },
  })

  revalidatePath("/cotacoes")
  return { ok: true, id: criada.id }
}

/**
 * Grava os preços que UM fornecedor respondeu.
 *
 * `upsert` por (participante, item): a resposta costuma chegar em partes — o
 * fornecedor manda o preço de dois itens hoje e o do terceiro amanhã. Recriar
 * tudo apagaria o que já estava lá.
 *
 * Campo vazio APAGA o preço daquele item, e não grava zero: "não tenho" e
 * "é de graça" são coisas diferentes, e zero venceria a comparação.
 */
export async function salvarPrecos(
  participantId: string,
  _prev: EstadoCotacao,
  formData: FormData
): Promise<EstadoCotacao> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const participante = await prisma.quotationParticipant.findFirst({
    where: { id: participantId, quotation: { tenantId } },
    include: { quotation: { select: { id: true, status: true } } },
  })
  if (!participante) return { erro: "naoEncontrado" }
  if (!aceitaPreco(participante.quotation.status)) return { erro: "cotacaoFechada" }

  // Só itens DESTA cotação: um itemId de outra gravaria preço num lugar que a
  // comparação desta tela nunca mostraria.
  const itens = await prisma.quotationItem.findMany({
    where: { quotationId: participante.quotation.id },
    select: { id: true },
  })

  await prisma.$transaction(async (tx) => {
    for (const item of itens) {
      const cru = String(formData.get(`preco_${item.id}`) ?? "").trim()

      if (cru === "") {
        // Vazio = não cotou. Apaga se havia.
        await tx.quotationPrice.deleteMany({
          where: { participantId, itemId: item.id },
        })
        continue
      }

      const valor = numero(cru)
      // Negativo não existe; o banco também recusa, mas aqui a mensagem é
      // melhor que um erro de constraint.
      if (valor < 0) continue

      await tx.quotationPrice.upsert({
        where: { participantId_itemId: { participantId, itemId: item.id } },
        create: { participantId, itemId: item.id, unitPrice: valor },
        update: { unitPrice: valor },
      })
    }

    await tx.quotationParticipant.update({
      where: { id: participantId },
      data: {
        respondedAt: new Date(),
        notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
      },
    })
  })

  revalidatePath(`/cotacoes/${participante.quotation.id}`)
  return { ok: true }
}

/**
 * Fecha a cotação escolhendo um fornecedor, e gera a ordem de compra.
 *
 * A compra nasce em RASCUNHO e com os preços COTADOS — que é o ponto todo: o
 * número que o fornecedor deu vira o número da ordem, sem redigitação e sem a
 * chance de digitar errado o preço que se acabou de comparar.
 *
 * Só os itens que ELE cotou entram. Levar os outros criaria linhas com preço
 * zero que ninguém combinou.
 */
/** Sinaliza a perda da corrida de fechamento. Erro próprio para o `catch`
 *  distinguir isso de uma falha de banco de verdade. */
class CotacaoJaFechada extends Error {}

export async function fecharCotacao(
  quotationId: string,
  participantId: string
): Promise<EstadoCotacao> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const c = await getCotacao(quotationId)
  if (!c) return { erro: "naoEncontrada" }
  if (c.status !== "ABERTA") return { erro: "cotacaoFechada" }

  const itens: ItemCotado[] = c.items.map((i) => ({
    id: i.id,
    partId: i.partId,
    nome: i.part.name,
    quantidade: Number(i.quantity),
  }))
  const participantes: Participante[] = c.participants.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    nome: p.supplier.name,
  }))
  const precos: PrecoCotado[] = c.participants.flatMap((p) =>
    p.prices.map((x) => ({ participantId: p.id, itemId: x.itemId, unitPrice: Number(x.unitPrice) }))
  )

  const totais = totaisPorFornecedor(itens, participantes, precos)
  if (!podeFecharCom(totais, participantId)) return { erro: "fornecedorSemPreco" }

  const vencedor = c.participants.find((p) => p.id === participantId)
  if (!vencedor) return { erro: "naoEncontrada" }

  const precoDoItem = new Map(vencedor.prices.map((p) => [p.itemId, Number(p.unitPrice)]))
  const linhas = c.items
    .filter((i) => precoDoItem.has(i.id))
    .map((i) => {
      const unitCost = precoDoItem.get(i.id)!
      const quantity = Number(i.quantity)
      return {
        partId: i.partId,
        quantity,
        unitCost,
        total: Math.round(quantity * unitCost * 100) / 100,
      }
    })

  const compra = await prisma.$transaction(async (tx) => {
    // ─── A trava contra fechar duas vezes ──────────────────────────────────
    //
    // A checagem de status lá em cima acontece FORA desta transação. Dois
    // administradores na mesma tela — ou um clique reenviado antes do redirect
    // — passariam os dois por ela e criariam DUAS ordens de compra idênticas,
    // que ao serem recebidas dobrariam estoque e despesa.
    //
    // `updateMany` com o status no WHERE é a trava: quem chega primeiro muda
    // ABERTA→FECHADA e recebe count 1; o segundo encontra a linha já fechada,
    // recebe count 0 e aborta ANTES de criar a compra.
    //
    // Vem antes do `create` de propósito: perder a corrida não pode deixar uma
    // ordem de compra órfã para trás.
    const fechou = await tx.quotation.updateMany({
      where: { id: quotationId, tenantId, status: "ABERTA" },
      data: { status: "FECHADA", closedAt: new Date(), winnerId: participantId },
    })
    if (fechou.count === 0) throw new CotacaoJaFechada()

    const criada = await tx.purchaseOrder.create({
      data: {
        tenantId,
        number: await proximoNumeroDeCompra(tx, tenantId),
        supplierId: vencedor.supplierId,
        status: "RASCUNHO",
        notes: `Cotação #${c.number} — ${c.title}`,
        total: linhas.reduce((s, l) => s + l.total, 0),
        items: { create: linhas },
      },
      select: { id: true },
    })

    return criada
  }).catch((e) => {
    if (e instanceof CotacaoJaFechada) return null
    throw e
  })

  // `null` = outra execução fechou primeiro. A transação foi desfeita inteira,
  // então não há ordem de compra pela metade.
  if (!compra) return { erro: "cotacaoFechada" }

  revalidatePath("/cotacoes")
  revalidatePath("/purchases")
  return { ok: true, id: compra.id }
}

export async function cancelarCotacao(id: string): Promise<EstadoCotacao> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const c = await prisma.quotation.findFirst({
    where: { id, tenantId },
    select: { status: true },
  })
  if (!c) return { erro: "naoEncontrada" }
  // Cotação fechada já virou compra; cancelar aqui não desfaria aquilo e
  // deixaria as duas telas contando histórias diferentes.
  if (c.status === "FECHADA") return { erro: "cotacaoFechada" }

  await prisma.quotation.update({ where: { id }, data: { status: "CANCELADA" } })
  revalidatePath("/cotacoes")
  return { ok: true }
}
