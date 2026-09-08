"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import {
  alcancarHoje,
  FREQUENCIAS,
  proximaData,
  type Frequencia,
} from "@/lib/contrato-recorrente"
import type { ContractFrequency } from "@/generated/prisma/client"
import { notificar } from "@/lib/notificar"

export type EstadoContrato = { erro?: string; ok?: boolean }

const schema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  frequency: z.enum(FREQUENCIAS as [Frequencia, ...Frequencia[]]),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
  amount: z.coerce.number().min(0).max(9_999_999),
  technicianId: z.string().optional(),
  startsAt: z.string().min(10),
  endsAt: z.string().optional(),
})

/** Data vinda de <input type="date"> ("2026-08-11") como meia-noite UTC. */
function comoData(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export async function salvarContrato(
  _prev: EstadoContrato,
  formData: FormData
): Promise<EstadoContrato> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Contrato gera OS sozinho e define faturamento recorrente — é decisão
  // comercial, não de quem está em campo.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { erro: "dadosInvalidos" }
  const d = parsed.data

  // clientId e technicianId vêm do formulário: sem conferir o tenant, daria
  // pra criar contrato apontando pro cliente de outra empresa.
  const cliente = await prisma.client.findFirst({
    where: { id: d.clientId, tenantId },
    select: { id: true },
  })
  if (!cliente) return { erro: "clienteNaoEncontrado" }

  if (d.technicianId) {
    const tec = await prisma.user.findFirst({
      where: { id: d.technicianId, tenantId },
      select: { id: true },
    })
    if (!tec) return { erro: "tecnicoNaoEncontrado" }
  }

  const inicio = comoData(d.startsAt)
  const fim = d.endsAt ? comoData(d.endsAt) : null
  if (fim && fim < inicio) return { erro: "fimAntesDoInicio" }

  const id = String(formData.get("id") ?? "")

  if (id) {
    const existente = await prisma.serviceContract.findFirst({
      where: { id, tenantId },
      select: { id: true, nextRunAt: true },
    })
    if (!existente) return { erro: "naoEncontrado" }

    await prisma.serviceContract.update({
      where: { id },
      data: {
        clientId: d.clientId,
        title: d.title,
        description: d.description || null,
        frequency: d.frequency as ContractFrequency,
        dayOfMonth: d.dayOfMonth ?? null,
        amount: d.amount,
        technicianId: d.technicianId || null,
        startsAt: inicio,
        endsAt: fim,
        // A próxima execução é recalculada a partir do início: mudar a
        // frequência sem isso deixaria o contrato preso na data do regime
        // antigo, e ninguém entenderia por que a OS não veio quando devia.
        nextRunAt: alcancarHoje(inicio, d.frequency, d.dayOfMonth ?? null, new Date()),
      },
    })
  } else {
    await prisma.serviceContract.create({
      data: {
        tenantId,
        clientId: d.clientId,
        title: d.title,
        description: d.description || null,
        frequency: d.frequency as ContractFrequency,
        dayOfMonth: d.dayOfMonth ?? null,
        amount: d.amount,
        technicianId: d.technicianId || null,
        startsAt: inicio,
        endsAt: fim,
        nextRunAt: alcancarHoje(inicio, d.frequency, d.dayOfMonth ?? null, new Date()),
      },
    })
  }

  revalidatePath("/contracts")
  return { ok: true }
}

export async function alternarContrato(id: string): Promise<EstadoContrato> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const c = await prisma.serviceContract.findFirst({
    where: { id, tenantId },
    select: { id: true, active: true, frequency: true, dayOfMonth: true, startsAt: true },
  })
  if (!c) return { erro: "naoEncontrado" }

  await prisma.serviceContract.update({
    where: { id },
    data: {
      active: !c.active,
      // Ao reativar, recalcula: um contrato parado por meses voltaria com
      // data vencida e geraria OS atrasada no primeiro cron.
      ...(!c.active
        ? {
            nextRunAt: alcancarHoje(
              c.startsAt,
              c.frequency as Frequencia,
              c.dayOfMonth,
              new Date()
            ),
          }
        : {}),
    },
  })

  revalidatePath("/contracts")
  return { ok: true }
}

export async function excluirContrato(id: string): Promise<EstadoContrato> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  // deleteMany com tenantId: delete por id sozinho apagaria contrato alheio
  // se o id vazasse. As OS já geradas ficam — são trabalho realizado, e o
  // onDelete: SetNull do schema apenas desfaz o vínculo.
  const { count } = await prisma.serviceContract.deleteMany({ where: { id, tenantId } })
  if (count === 0) return { erro: "naoEncontrado" }

  revalidatePath("/contracts")
  return { ok: true }
}

export async function getContratos() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.serviceContract.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    include: {
      client: { select: { id: true, name: true } },
      technician: { select: { id: true, name: true } },
      _count: { select: { orders: true } },
    },
  })
}

/**
 * Gera as OS dos contratos vencidos. Chamado pelo cron diário.
 *
 * Fora das Server Actions de propósito: não tem sessão nem tenant: percorre
 * todos os contratos ativos de todas as empresas.
 */
export async function gerarOsDosContratos(hoje: Date, limite: Date) {
  const vencidos = await prisma.serviceContract.findMany({
    where: { active: true, nextRunAt: { lte: limite } },
    include: { client: { select: { id: true } } },
  })

  let geradas = 0
  for (const c of vencidos) {
    // Contrato encerrado: desliga em vez de continuar consultando todo dia.
    if (c.endsAt && c.endsAt < hoje) {
      await prisma.serviceContract.update({ where: { id: c.id }, data: { active: false } })
      continue
    }
    if (c.startsAt > limite) continue

    const proxima = c.nextRunAt

    // Idempotência: se já existe OS deste contrato agendada pra esta data, o
    // cron já rodou hoje (ou rodou duas vezes) e não pode duplicar.
    const jaExiste = await prisma.serviceOrder.findFirst({
      where: { contractId: c.id, scheduledAt: proxima },
      select: { id: true },
    })

    if (!jaExiste) {
      const ultimo = await prisma.serviceOrder.aggregate({
        where: { tenantId: c.tenantId },
        _max: { number: true },
      })
      await prisma.serviceOrder.create({
        data: {
          number: (ultimo._max.number ?? 0) + 1,
          title: c.title,
          description: c.description,
          tenantId: c.tenantId,
          clientId: c.clientId,
          technicianId: c.technicianId,
          contractId: c.id,
          scheduledAt: proxima,
          totalAmount: c.amount,
        },
      })
      geradas++

      // Avisa quem vai executar. Sem isto, a OS do contrato nasce de
      // madrugada e o técnico só descobre abrindo o sistema — que é
      // justamente o contrário do que gerar com antecedência serve.
      await notificar({
        tenantId: c.tenantId,
        evento: "osDeContrato",
        corpo: c.title,
        url: "/service-orders",
        responsavelId: c.technicianId,
      })
    }

    await prisma.serviceContract.update({
      where: { id: c.id },
      data: {
        lastRunAt: proxima,
        nextRunAt: proximaData(proxima, c.frequency as Frequencia, c.dayOfMonth),
      },
    })
  }

  return geradas
}
