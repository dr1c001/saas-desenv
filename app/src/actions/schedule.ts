"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { checarAcao, getTenant, requireActiveSubscription } from "@/lib/auth"
import { comDiaTrocado, motivoParaNaoReagendar } from "@/lib/agenda"
import { autorAtual, registrarMudancas, retratoDaOs } from "@/lib/historico-os-db"

export async function getScheduledOrders(year: number, month: number) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  return prisma.serviceOrder.findMany({
    where: {
      tenantId,
      scheduledAt: { gte: start, lte: end },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      client: { select: { name: true } },
      technician: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  })
}

export type ResultadoDoReagendamento =
  | { ok: true; quando: string }
  | { ok: false; motivo: string }

/**
 * Move a OS de dia, mantendo a hora.
 *
 * **O cliente escolhe o DIA, não o instante.** A hora vem do agendamento que já
 * está no banco e o servidor é quem monta a data final. Server Action é um
 * endereço HTTP como qualquer outro: se aceitasse um instante pronto, bastaria
 * chamar direto para gravar qualquer data em qualquer OS — e o arrasto na tela
 * não teria sido a única forma de chegar aqui.
 *
 * O cálculo dá o mesmo resultado no servidor (UTC) e no navegador (fuso do
 * usuário) porque lê e escreve no mesmo fuso: a diferença se cancela. Valeria
 * revisar se o Brasil voltasse a ter horário de verão.
 */
export async function reagendarOs(
  orderId: string,
  ano: number,
  mes: number,
  dia: number
): Promise<ResultadoDoReagendamento> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (await checarAcao("os.reagendar")) return { ok: false, motivo: "semPermissao" }

  if (!Number.isInteger(dia) || dia < 1 || dia > 31 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { ok: false, motivo: "dataInvalida" }
  }

  // Filtrar por tenantId aqui é o que impede reagendar OS de outra empresa: o
  // orderId vem do navegador e não vale nada por si só.
  const os = await prisma.serviceOrder.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true, status: true, scheduledAt: true, totalAmount: true,
      conclusionNote: true, warrantyDays: true,
      technician: { select: { name: true } },
    },
  })
  if (!os) return { ok: false, motivo: "naoEncontrada" }

  // Sem hora de origem não há o que preservar — e uma OS sem agendamento não
  // aparece na agenda, então chegar aqui já significa que algo mudou embaixo.
  if (!os.scheduledAt) return { ok: false, motivo: "semAgendamento" }

  // A MESMA regra que a tela usa para decidir o que deixa arrastar. Repetida
  // aqui porque a checagem da tela é conveniência; esta é a que vale.
  const travado = motivoParaNaoReagendar(os.status)
  if (travado) return { ok: false, motivo: travado }

  const quando = comDiaTrocado(os.scheduledAt, ano, mes, dia)

  await prisma.serviceOrder.update({
    where: { id: orderId, tenantId },
    data: { scheduledAt: quando },
  })

  // Reagendar pelo arrasto entra no histórico igual a reagendar pelo
  // formulário. Se só o formulário registrasse, o caminho mais rápido seria
  // também o que não deixa rastro — e a linha do tempo passaria a mentir por
  // omissão exatamente no campo que mais gera discussão com o cliente.
  await registrarMudancas(
    tenantId,
    orderId,
    retratoDaOs(os),
    retratoDaOs({ ...os, scheduledAt: quando }),
    await autorAtual(userId)
  )

  revalidatePath("/schedule")
  revalidatePath(`/service-orders/${orderId}`)

  return { ok: true, quando: quando.toISOString() }
}
