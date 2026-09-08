import { prisma } from "@/lib/prisma"

/**
 * O próximo número de orçamento da empresa.
 *
 * Mora aqui, e não em actions/quotes.ts, porque dois caminhos precisam dele: a
 * criação normal e a que nasce de uma visita (actions/os-orcamento.ts). Um
 * arquivo `"use server"` só pode exportar Server Action, então a função não
 * podia ser compartilhada de lá — e duas cópias da mesma contagem é como duas
 * telas passam a numerar diferente.
 *
 * Lê "o último número" SEM lock: duas criações simultâneas calculam o mesmo
 * número. É de propósito — `@@unique([tenantId, number])` faz a segunda falhar
 * com P2002, e `retryOnUniqueConflict` tenta de novo com o número atualizado.
 * Travar a tabela seria mais caro que repetir uma vez o que quase nunca colide.
 */
export async function proximoNumeroDeOrcamento(tenantId: string): Promise<number> {
  const ultimo = await prisma.quote.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (ultimo?.number ?? 0) + 1
}
