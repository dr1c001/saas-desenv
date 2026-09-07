"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { montarPlano, problemaNoPlano, rotuloDaParcela } from "@/lib/plano-de-pagamento"
import { formatOsNumber } from "@/lib/utils"

// Parcelar o recebimento de uma OS: entrada à vista mais saldo a prazo.
//
// Arquivo próprio, e não mais um pedaço de service-orders.ts: aquele arquivo já
// passa de setecentas linhas e cuida de outro assunto. Toda export aqui é
// endereço HTTP despachável e se defende sozinha.

export type EstadoDoParcelamento = {
  erro?: string
  ok?: boolean
  parcelas?: number
}

/**
 * Substitui o recebimento pendente da OS por um plano de parcelas.
 *
 * ─── Por que SUBSTITUI, e não acrescenta ─────────────────────────────────────
 *
 * Faturar já cria uma receita com o valor cheio. Acrescentar as parcelas ao
 * lado dela faria o contas a receber somar o serviço duas vezes — e o dono
 * cobraria R$ 4.000 de um serviço de R$ 2.000.
 *
 * ─── O que NUNCA é tocado ────────────────────────────────────────────────────
 *
 * Receita já RECEBIDA. O dinheiro entrou, está no extrato e está no resultado
 * do mês em que entrou. Se alguma parcela já foi paga, o parcelamento é
 * recusado inteiro: refazer um plano por cima de dinheiro que já entrou é
 * conversa entre pessoas, não escrita silenciosa em banco.
 */
export async function parcelarRecebimento(
  orderId: string,
  entrada: number,
  parcelas: number,
  prazoDias: number,
  entradaRecebida: boolean
): Promise<EstadoDoParcelamento> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Mexe em contas a receber. Não é gesto de técnico em campo.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const os = await prisma.serviceOrder.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      number: true,
      title: true,
      createdAt: true,
      concludedAt: true,
      totalAmount: true,
      branchId: true,
      revenues: { select: { id: true, status: true } },
    },
  })
  if (!os) return { erro: "naoEncontrada" }

  const total = Number(os.totalAmount)
  const problema = problemaNoPlano({ total, entrada, parcelas, prazoDias })
  if (problema) return { erro: problema }

  // Alguma parcela já paga trava tudo. Ver o cabeçalho da função.
  if (os.revenues.some((r) => r.status === "PAID")) return { erro: "jaTemRecebimento" }

  // A data da EXECUÇÃO é o marco dos prazos: "7 dias após a data da execução do
  // serviço" é como o cliente combina, e não "7 dias depois de eu lançar isto
  // no sistema". Sem conclusão, a criação da OS é a melhor aproximação.
  const execucao = os.concludedAt ?? os.createdAt
  const plano = montarPlano({ total, entrada, parcelas, prazoDias }, execucao)
  const numero = formatOsNumber(os.number, os.createdAt)
  const agora = new Date()

  await prisma.$transaction(async (tx) => {
    // Fora as pendentes desta OS. Numa transação com a criação: se apagasse e
    // não criasse, o serviço sumiria do contas a receber inteiro.
    await tx.revenue.deleteMany({ where: { orderId: os.id, tenantId, status: "PENDING" } })

    for (const p of plano) {
      await tx.revenue.create({
        data: {
          tenantId,
          orderId: os.id,
          branchId: os.branchId,
          description: `${numero} — ${os.title} (${rotuloDaParcela(p, parcelas)})`,
          amount: p.valor,
          dueDate: p.vencimento,
          // TODAS as parcelas têm competência na EXECUÇÃO. É o ponto do
          // recurso: um serviço de R$ 2.000 feito em setembro é resultado de
          // setembro inteiro, mesmo com R$ 1.500 entrando em outubro. Sem isto,
          // o DRE em competência mostraria o mês partido ao meio.
          accrualDate: execucao,
          // A entrada é o único caso em que o dinheiro pode já ter entrado: ela
          // é paga na hora, e obrigar um segundo clique para marcar seria
          // atrito num gesto que a pessoa acabou de fazer.
          ...(p.entrada && entradaRecebida
            ? { status: "PAID" as const, paidAt: agora }
            : {}),
        },
      })
    }
  })

  revalidatePath("/finance")
  revalidatePath(`/service-orders/${orderId}`)
  return { ok: true, parcelas: plano.length }
}
