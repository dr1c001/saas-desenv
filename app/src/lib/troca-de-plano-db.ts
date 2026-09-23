import { prisma } from "@/lib/prisma"
import { chegouAHora } from "@/lib/troca-de-plano"

// O lado do BANCO da troca de plano. A regra pura — quem pode trocar, para
// onde, e quando passa a valer — mora em lib/troca-de-plano.ts.
//
// Separados pela mesma razão de comissao.ts / comissao-db.ts: a regra decide
// dinheiro recorrente e precisa ser testável sem banco; o efeito colateral
// precisa do Prisma.

/**
 * Aplica o downgrade agendado cujo período já acabou.
 *
 * Chamado de DOIS lugares, de propósito: a confirmação do pagamento da
 * renovação (o momento natural — começa um ciclo novo) e o cron diário, que é
 * a rede de segurança para a assinatura que não renovou. Sem o cron, quem
 * parasse de pagar ficaria no plano caro para sempre.
 *
 * O valor na Asaas NÃO é tocado aqui: ele já mudou no instante do
 * agendamento, para a próxima fatura sair pelo valor novo. O que esperava o
 * fim do período pago era o ACESSO.
 */
export async function aplicarTrocaAgendada(
  sub: { id: string; tenantId: string; pendingPlanId: string | null; currentPeriodEnd: Date },
  agora: Date
): Promise<boolean> {
  if (!chegouAHora(sub, agora)) return false
  const destino = sub.pendingPlanId!

  // Condicionado ao agendamento que foi LIDO: se ele mudou no meio (o cliente
  // desfez, outra execução aplicou), esta escrita não vale — e o tenant não é
  // tocado.
  const { count } = await prisma.subscription.updateMany({
    where: { id: sub.id, pendingPlanId: destino },
    data: { planId: destino, pendingPlanId: null },
  })
  if (count === 0) return false

  await prisma.tenant.update({ where: { id: sub.tenantId }, data: { planId: destino } })
  return true
}
