import { prisma } from "@/lib/prisma"

/**
 * O próximo número de OS da empresa.
 *
 * Mora aqui, e não dentro da action, porque a API de integração cria OS pelo
 * mesmo caminho. Duas cópias dessa conta acabariam divergindo — e numeração de
 * OS divergente é o tipo de coisa que só aparece quando o cliente liga
 * reclamando de duas ordens com o mesmo número.
 *
 * Lê "o último número" SEM lock: duas criações simultâneas podem calcular o
 * mesmo. `number` tem `@@unique([tenantId, number])`, então a segunda falha com
 * P2002 em vez de duplicar, e quem chama tenta de novo com
 * `retryOnUniqueConflict`. (Achado em auditoria pré-venda, 2026-08-05.)
 */
export async function proximoNumeroDeOs(tenantId: string): Promise<number> {
  const last = await prisma.serviceOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}
