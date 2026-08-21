"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomUUID } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checarAcao, filtroDeFilialAtual, getTenant, requireActiveSubscription } from "@/lib/auth"
import { baixarPecasDaOs } from "@/lib/estoque-db"
import {
  autorAtual,
  registrarCriacao,
  registrarMudancas,
  retratoDaOs,
} from "@/lib/historico-os-db"
import { avisarClienteDaOs } from "@/lib/enviar-aviso-cliente"
import { sendPushToUser } from "@/lib/push"
import { retryOnUniqueConflict } from "@/lib/retry"
import { proximoNumeroDeOs } from "@/lib/os-numero"
import { filialParaNovo } from "@/lib/filial"
import { requireCotaDeOs } from "@/lib/plan"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"

const orderSchema = z.object({
  title: z.string().min(2, "titleRequired"),
  description: z.string().optional(),
  clientId: z.string().min(1, "clientRequired"),
  technicianId: z.string().optional(),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"])
    .default("OPEN"),
  scheduledAt: z.string().optional(),
})

export type OrderFormState = {
  errors?: Record<string, string[]>
  message?: string
}



export async function createServiceOrder(
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const { tenantId, userId, branchId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (await checarAcao("os.criar")) return { message: (await getTranslations("common"))("noPermission") }

  // "50 OS por mês" do Starter não era verificado em lugar nenhum. Checa antes
  // de validar o formulário pra não deixar a pessoa preencher tudo à toa.
  try {
    await requireCotaDeOs(tenantId)
  } catch (e) {
    return { message: (e as Error).message }
  }

  const raw = Object.fromEntries(formData.entries())
  const parsed = orderSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }

  const { title, description, clientId, technicianId, status, scheduledAt } = parsed.data

  // clientId/technicianId vêm do formulário sem checagem — sem validar que
  // pertencem ao próprio tenant, dava pra linkar a OS a um Client/User de
  // outra empresa e ver os dados completos dele na página da OS.
  // (Achado em revisão de segurança 2026-07-19.)
  const client = await prisma.client.findUnique({
    where: { id: clientId, tenantId },
    // branchId: a OS herda a filial do CLIENTE, e não de quem digitou. Um
    // atendente da matriz abrindo OS para cliente da filial não muda de quem é
    // aquele cliente. Ver lib/filial.ts.
    select: { id: true, branchId: true },
  })
  const te = await getTranslations("errors")
  if (!client) return { message: te("clientNotFound") }

  if (technicianId) {
    const technician = await prisma.user.findUnique({ where: { id: technicianId, tenantId }, select: { id: true } })
    if (!technician) return { message: te("technicianNotFound") }
  }

  // Parse items sent as JSON string
  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  // proximoNumeroDeOs lê "o último número" sem lock — duas criações
  // simultâneas podem calcular o mesmo número. number tem
  // @@unique([tenantId, number]), então a segunda só falha (P2002) em vez de
  // duplicar; retryOnUniqueConflict tenta de novo com o número atualizado.
  // (Achado em auditoria pré-venda, 2026-08-05.)
  const criada = await retryOnUniqueConflict(async () => {
    const number = await proximoNumeroDeOs(tenantId)
    return prisma.serviceOrder.create({
      data: {
        number,
        title,
        description: description || null,
        clientId,
        tenantId,
        branchId: filialParaNovo(client.branchId, branchId),
        technicianId: technicianId || userId,
        status,
        totalAmount: total,
        // @default(uuid()) do schema não está de fato aplicado na coluna do
        // banco (drift confirmado via information_schema — column_default nulo)
        // — sem gerar aqui, clientToken ficava sempre nulo, quebrando o portal
        // do cliente e o NPS (ambos dependem desse token nos links públicos).
        // (Achado verificando o sistema de NPS, 2026-07-22.)
        clientToken: randomUUID(),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        items: {
          create: items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.quantity * i.unitPrice,
          })),
        },
      },
      select: { id: true },
    })
  })

  // Primeiro ponto da linha do tempo. Nunca lanca: historico e registro do
  // que aconteceu, nao parte do que esta acontecendo.
  await registrarCriacao(tenantId, criada.id, await autorAtual(userId))

  // Send push notification to assigned technician
  if (technicianId && technicianId !== userId) {
    try {
      const subs = await prisma.pushSubscription.findMany({
        where: { userId: technicianId, user: { tenantId } },
        select: { endpoint: true, p256dh: true, auth: true },
      })
      if (subs.length > 0) {
        await sendPushToUser(subs, {
          title: (await getTranslations("notifications"))("newOrder.title"),
          body: title,
          url: "/service-orders",
        })
      }
    } catch {
      // Push failure should not block OS creation
    }
  }

  revalidatePath("/service-orders")
  redirect("/service-orders")
}

export async function updateOrderStatus(id: string, status: string) {
  const { tenantId, role, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  if (await checarAcao("os.status")) return

  const validStatus = ["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"]
  if (!validStatus.includes(status)) return

  // Faturar cria um Revenue de verdade, e uma OS já faturada tem NFS-e/
  // assinatura vinculada (mesmo raciocínio de completeServiceOrder/
  // updateServiceOrder) — sem isso, qualquer TECHNICIAN faturava uma OS
  // direto por aqui (bypassando o fluxo de conclusão) e dava pra
  // "desfaturar" mudando o status de novo depois. TECHNICIAN continua livre
  // pra mover entre OPEN/IN_PROGRESS/DONE/CANCELLED, seu fluxo legítimo de
  // campo. (Achado em auditoria pré-venda, 2026-08-05.)
  const current = await prisma.serviceOrder.findUnique({
    where: { id, tenantId },
    // Campos a mais servem ao historico: sem o retrato de ANTES nao ha o que
    // comparar depois da gravacao.
    select: {
      status: true,
      scheduledAt: true,
      totalAmount: true,
      conclusionNote: true,
      warrantyDays: true,
      technician: { select: { name: true } },
    },
  })
  if (!current || current.status === "INVOICED") return
  if (status === "INVOICED" && role !== "OWNER" && role !== "ADMIN") return

  const data: Record<string, unknown> = { status }
  if (status === "DONE") data.concludedAt = new Date()

  const order = await prisma.serviceOrder.update({
    where: { id, tenantId },
    data,
    select: {
      number: true, title: true, totalAmount: true, createdAt: true,
      // A receita criada a partir desta OS herda a filial dela.
      branchId: true,
      status: true, scheduledAt: true, conclusionNote: true, warrantyDays: true,
      technician: { select: { name: true } },
    },
  })

  await registrarMudancas(
    tenantId,
    id,
    retratoDaOs(current),
    retratoDaOs(order),
    await autorAtual(userId)
  )

  // Auto-create revenue when OS is invoiced
  if (status === "INVOICED" && Number(order.totalAmount) > 0) {
    const existing = await prisma.revenue.findFirst({ where: { orderId: id, tenantId } })
    const year = new Date(order.createdAt).getFullYear()
    const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
    if (!existing) {
      await prisma.revenue.create({
        data: {
          description: `${osNum} — ${order.title}`,
          amount: order.totalAmount,
          dueDate: new Date(),
          tenantId,
          // A receita é da unidade que executou o serviço. Sem herdar, o
          // faturamento apareceria no fechamento de todas as filiais.
          branchId: order.branchId,
          orderId: id,
        },
      })
    }
  }

  // Peça sai do estoque quando o serviço fica pronto — antes disso ela ainda
  // está fisicamente na prateleira. Idempotente e à prova de falha: OS
  // concluída não pode ser travada porque o estoque não fechou.
  if (status === "DONE" || status === "INVOICED") {
    await baixarPecasDaOs(prisma, tenantId, id, userId)
  }

  // Avisa o cliente final, se a empresa tiver ligado isso. Depois da gravação
  // e sem await no caminho crítico de erro: a função nunca lança, mas ainda
  // assim o aviso é acessório e a OS já está salva.
  await avisarClienteDaOs(id, current.status, status)

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  revalidatePath("/finance")
}

export async function completeServiceOrder(
  id: string,
  conclusionNote: string,
  // partId opcional: item digitado na hora (mao de obra, taxa) continua sendo
  // o caminho normal de quem nao controla estoque.
  items: { description: string; quantity: number; unitPrice: number; partId?: string | null }[],
  invoiceImmediately: boolean
) {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Concluir grava receita e baixa estoque. Quem não pode concluir não pode
  // disparar isso nem pela fila offline, que chama esta mesma função.
  if (await checarAcao("os.concluir")) throw new Error((await getTranslations("common"))("noPermission"))

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const status = invoiceImmediately ? "INVOICED" : "DONE"

  // Fetch order before transaction — needed for revenue description
  const order = await prisma.serviceOrder.findUnique({
    where: { id, tenantId },
    select: {
      number: true, title: true, createdAt: true, status: true,
      branchId: true,
      // Retrato de ANTES pro historico: sem ele nao ha o que comparar.
      scheduledAt: true, totalAmount: true, conclusionNote: true,
      warrantyDays: true, technician: { select: { name: true } },
    },
  })
  const te2 = await getTranslations("errors")
  if (!order) throw new Error(te2("orderNotFound"))
  // Uma OS já faturada tem consequências reais fora do banco (NFS-e emitida,
  // assinatura do cliente coletada) — reabrir e trocar itens/total aqui
  // dessincroniza tudo isso silenciosamente, sem nenhum aviso. Sem cancelamento
  // de NFS-e implementado no produto, não tem como corrigir isso depois.
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  if (order.status === "INVOICED") throw new Error(te2("invoicedOrderLocked"))

  // As escritas (itens + status/total da OS + criação de Revenue) viram uma
  // única transação — antes eram chamadas sequenciais soltas, e uma falha no
  // meio (ex: rede caindo no celular do técnico em campo) deixava itens
  // apagados sem os novos persistidos e sem o total/status atualizado.
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  await prisma.$transaction(async (tx) => {
    await tx.serviceItem.deleteMany({ where: { orderId: id } })
    if (items.length > 0) {
      await tx.serviceItem.createMany({
        data: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice,
          orderId: id,
          partId: i.partId || null,
        })),
      })
    }
    await tx.serviceOrder.update({
      where: { id, tenantId },
      data: {
        status,
        concludedAt: new Date(),
        conclusionNote: conclusionNote || null,
        totalAmount: total,
      },
    })
    if (invoiceImmediately && total > 0) {
      const existing = await tx.revenue.findFirst({ where: { orderId: id, tenantId } })
      if (!existing) {
        const year = new Date(order.createdAt).getFullYear()
        const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
        await tx.revenue.create({
          data: {
            description: `${osNum} — ${order.title}`,
            amount: total,
            dueDate: new Date(),
            tenantId,
            branchId: order.branchId,
            orderId: id,
          },
        })
      }
    }
  })

  // Depois da transacao: a OS concluida ja esta gravada, e o estoque nao pode
  // travar o trabalho de campo se falhar. Idempotente por orderId.
  await baixarPecasDaOs(prisma, tenantId, id, userId)

  await registrarMudancas(
    tenantId,
    id,
    retratoDaOs(order),
    retratoDaOs({
      status,
      scheduledAt: order.scheduledAt,
      totalAmount: total,
      conclusionNote: conclusionNote || null,
      warrantyDays: order.warrantyDays,
      technician: order.technician,
    }),
    await autorAtual(userId)
  )

  // Avisa o cliente final. Esta chamada FALTAVA: a regra de "mudou de status,
  // avisa o cliente" estava escrita só no updateOrderStatus, e concluir pelo
  // botão Concluir — que é o caminho normal, e também o que a fila offline usa
  // — nunca avisava ninguém. A empresa ligava "avisar ao concluir" na tela,
  // via o aviso de "a caminho" funcionando, e concluía que estava tudo no ar.
  // (Achado em auditoria, 20/08/2026.)
  await avisarClienteDaOs(id, order.status, status)

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  revalidatePath("/history")
  revalidatePath("/finance")
  revalidatePath("/parts")
}

export async function updateServiceOrder(
  id: string,
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const raw = Object.fromEntries(formData.entries())
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }

  const { title, description, clientId, technicianId, scheduledAt } = parsed.data

  // A que mais pesa: esta função reescreve os ITENS e o VALOR TOTAL. Até aqui
  // não tinha checagem de papel nenhuma — qualquer técnico com a aba mudava o
  // preço de um serviço já executado.
  if (await checarAcao("os.editar")) return { message: (await getTranslations("common"))("noPermission") }

  // Confere posse da OS e valida clientId/technicianId ANTES de tocar em
  // ServiceItem — antes disso, um id de OS de outro tenant tinha os itens
  // reais apagados/substituídos por itens forjados antes do update final
  // (que é quem checava tenantId) falhar. (Achado em revisão de segurança 2026-07-19.)
  const [order, client] = await Promise.all([
    prisma.serviceOrder.findUnique({
      where: { id, tenantId },
      // Retrato de ANTES pro historico da OS.
      select: {
        id: true, status: true, scheduledAt: true, totalAmount: true,
        conclusionNote: true, warrantyDays: true,
        technician: { select: { name: true } },
      },
    }),
    prisma.client.findUnique({ where: { id: clientId, tenantId }, select: { id: true } }),
  ])
  const te3 = await getTranslations("errors")
  if (!order) return { message: te3("orderNotFound") }
  // Mesmo motivo do completeServiceOrder: OS já faturada tem NFS-e/assinatura
  // vinculada, que ficariam dessincronizadas de qualquer edição posterior de
  // itens/total. (Achado verificando o sistema antes da primeira venda,
  // 2026-08-03.)
  if (order.status === "INVOICED") return { message: te3("invoicedOrderLocked") }
  if (!client) return { message: te3("clientNotFound") }

  if (technicianId) {
    const technician = await prisma.user.findUnique({ where: { id: technicianId, tenantId }, select: { id: true } })
    if (!technician) return { message: te3("technicianNotFound") }
  }

  const itemsRaw = formData.get("items")
  const items: { description: string; quantity: number; unitPrice: number }[] = itemsRaw
    ? JSON.parse(itemsRaw as string)
    : []

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  await prisma.$transaction([
    prisma.serviceItem.deleteMany({ where: { orderId: id } }),
    ...(items.length > 0
      ? [
          prisma.serviceItem.createMany({
            data: items.map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.quantity * i.unitPrice,
              orderId: id,
            })),
          }),
        ]
      : []),
    prisma.serviceOrder.update({
      where: { id, tenantId },
      data: {
        title,
        description: description || null,
        clientId,
        technicianId: technicianId || null,
        totalAmount: total,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    }),
  ])

  // O responsavel novo pelo NOME: guardar id faria a linha do tempo virar
  // "responsavel mudou para cmr04..." no dia em que a pessoa saisse.
  const novoResponsavel = technicianId
    ? (await prisma.user.findUnique({ where: { id: technicianId }, select: { name: true } }))?.name ?? null
    : null

  await registrarMudancas(
    tenantId,
    id,
    retratoDaOs(order),
    retratoDaOs({
      status: order.status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      totalAmount: total,
      conclusionNote: order.conclusionNote,
      warrantyDays: order.warrantyDays,
      technician: novoResponsavel ? { name: novoResponsavel } : null,
    }),
    await autorAtual(userId)
  )

  revalidatePath("/service-orders")
  revalidatePath(`/service-orders/${id}`)
  redirect(`/service-orders/${id}`)
}

export async function deleteServiceOrder(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Única função de delete no app sem essa checagem — apagar uma OS já
  // faturada/com NFS-e emitida é destrutivo (itens, anexos e checklist somem
  // via cascade, Revenue vinculada fica órfã). (Achado em revisão de
  // segurança pré-lançamento, 2026-07-28.)
  if (role !== "OWNER" && role !== "ADMIN") redirect("/service-orders")
  await prisma.serviceOrder.delete({ where: { id, tenantId } })
  revalidatePath("/service-orders")
  redirect("/service-orders")
}

export async function getServiceOrders(filters?: {
  status?: string
  statusIn?: string[]
  q?: string
  filial?: string | null
}) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.serviceOrder.findMany({
    where: {
      tenantId,
      // Dentro de AND pelo mesmo motivo de getClients: o `OR` abaixo é da busca.
      ...(await filtroDeFilialAtual(filters?.filial)),
      ...(filters?.statusIn
        ? { status: { in: filters.statusIn as never[] } }
        : filters?.status
          ? { status: filters.status as never }
          : {}),
      ...(filters?.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" } },
              { description: { contains: filters.q, mode: "insensitive" } },
              { client: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      client: { select: { name: true } },
      technician: { select: { name: true } },
      items: { select: { description: true, quantity: true, unitPrice: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getServiceOrder(id: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.serviceOrder.findUnique({
    where: { id, tenantId },
    include: {
      client: true,
      technician: true,
      items: true,
      attachments: true,
      checklist: { orderBy: { position: "asc" } },
    },
  })
}
