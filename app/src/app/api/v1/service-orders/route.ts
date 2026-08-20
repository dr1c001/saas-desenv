import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  autenticarApi,
  corpoJson,
  erroApi,
  limiteDaBusca,
  pagina,
  paginacao,
} from "@/lib/api-auth"
import { errosDeValidacao, ordemApi, ordemEntrada } from "@/lib/api-formato"
import { getLimites } from "@/lib/plan"
import { proximoNumeroDeOs } from "@/lib/os-numero"
import { retryOnUniqueConflict } from "@/lib/retry"

export const CAMPOS = {
  id: true, number: true, title: true, description: true, status: true,
  scheduledAt: true, totalAmount: true, conclusionNote: true, createdAt: true,
  client: { select: { id: true, name: true } },
  technician: { select: { id: true, name: true } },
  items: { select: { description: true, quantity: true, unitPrice: true, total: true } },
} as const

const STATUS_VALIDOS = ["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"]

export async function GET(req: Request) {
  const r = await autenticarApi(req)
  if (!r.ok) return r.resposta

  const url = new URL(req.url)
  const limite = limiteDaBusca(url)
  const status = url.searchParams.get("status")?.trim()
  if (status && !STATUS_VALIDOS.includes(status)) {
    return erroApi(400, "invalid_status", `status must be one of: ${STATUS_VALIDOS.join(", ")}`)
  }

  const ordens = await prisma.serviceOrder.findMany({
    where: { tenantId: r.auth.tenantId, ...(status ? { status: status as never } : {}) },
    select: CAMPOS,
    orderBy: { id: "desc" },
    ...paginacao(url, limite),
  })

  return NextResponse.json(pagina(ordens.map(ordemApi), limite))
}

export async function POST(req: Request) {
  const r = await autenticarApi(req)
  if (!r.ok) return r.resposta
  const { tenantId } = r.auth

  const corpo = await corpoJson(req)
  if (corpo === null) return erroApi(400, "invalid_json", "Request body must be valid JSON.")

  const parsed = ordemEntrada.safeParse(corpo)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Some fields are invalid.",
          fields: errosDeValidacao(parsed.error),
        },
      },
      { status: 422 }
    )
  }
  const dados = parsed.data

  // A cota de OS do plano vale aqui também. Sem isso, a API seria a porta dos
  // fundos do limite que a tela cobra — e o Starter viraria ilimitado para
  // quem soubesse chamar. (Vem de getLimites e não de requireCotaDeOs porque
  // aquele monta a mensagem pelo next-intl, que depende de contexto de
  // request que rota de API pode não ter.)
  const { maxOsMes } = await getLimites(tenantId)
  if (maxOsMes !== null) {
    const agora = new Date()
    const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1))
    const doMes = await prisma.serviceOrder.count({
      where: { tenantId, createdAt: { gte: inicioDoMes } },
    })
    if (doMes >= maxOsMes) {
      return erroApi(
        403,
        "plan_limit_reached",
        `This plan allows ${maxOsMes} service orders per month.`
      )
    }
  }

  // client_id e technician_id vêm de fora e não valem nada sem conferir a
  // dona. Sem o filtro por tenantId, dava para pendurar a OS num cliente de
  // outra empresa e ler os dados dele na resposta.
  const cliente = await prisma.client.findFirst({
    where: { id: dados.client_id, tenantId },
    // A OS herda a filial do cliente, igual ao caminho da tela. Se a API
    // criasse OS sem filial, a integração viraria o jeito de furar a divisão
    // por unidade sem ninguém perceber.
    select: { id: true, branchId: true },
  })
  if (!cliente) return erroApi(422, "client_not_found", "client_id does not exist in this account.")

  if (dados.technician_id) {
    const tecnico = await prisma.user.findFirst({
      where: { id: dados.technician_id, tenantId },
      select: { id: true },
    })
    if (!tecnico) {
      return erroApi(422, "technician_not_found", "technician_id does not exist in this account.")
    }
  }

  const itens = dados.items ?? []
  const total = itens.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  const criada = await retryOnUniqueConflict(async () => {
    const number = await proximoNumeroDeOs(tenantId)
    return prisma.serviceOrder.create({
      data: {
        tenantId,
        number,
        title: dados.title,
        description: dados.description ?? null,
        clientId: cliente.id,
        branchId: cliente.branchId,
        technicianId: dados.technician_id ?? null,
        status: dados.status,
        totalAmount: total,
        scheduledAt: dados.scheduled_at ? new Date(dados.scheduled_at) : null,
        // O @default(uuid()) do schema não está aplicado na coluna de verdade
        // (drift confirmado). Sem gerar aqui, o portal do cliente e o NPS
        // ficam sem link. Mesmo motivo do createServiceOrder.
        clientToken: randomUUID(),
        items: {
          create: itens.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            total: i.quantity * i.unit_price,
          })),
        },
      },
      select: CAMPOS,
    })
  })

  return NextResponse.json(ordemApi(criada), { status: 201 })
}
