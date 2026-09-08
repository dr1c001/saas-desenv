// Gravação do histórico da OS.
//
// Separado de lib/historico-os.ts (que é puro) porque aqui se fala com o
// banco, e separado das actions porque três caminhos diferentes precisam
// gravar: troca de status, conclusão e edição da OS.

import { prisma } from "@/lib/prisma"
import { eventosDaMudanca, type RetratoDaOs, type TipoEvento } from "@/lib/historico-os"

export type Autor = { id: string | null; nome: string | null }

/**
 * Grava os eventos gerados pela diferença entre dois retratos.
 *
 * **Nunca lança.** O histórico é registro do que aconteceu, não parte do que
 * está acontecendo: falhar aqui não pode impedir o técnico de concluir a OS no
 * meio da rua. Falha vira log — e um histórico com buraco ainda é melhor que
 * uma OS que não fecha.
 */
export async function registrarMudancas(
  tenantId: string,
  orderId: string,
  antes: RetratoDaOs,
  depois: RetratoDaOs,
  autor: Autor
): Promise<number> {
  try {
    const eventos = eventosDaMudanca(antes, depois)
    if (eventos.length === 0) return 0

    await prisma.orderEvent.createMany({
      data: eventos.map((e) => ({
        tenantId,
        orderId,
        type: e.tipo,
        actorId: autor.id,
        actorName: autor.nome,
        before: e.antes,
        after: e.depois,
      })),
    })
    return eventos.length
  } catch (err) {
    console.error("Falha ao registrar histórico da OS:", orderId, err)
    return 0
  }
}

/** Marca a criação. Primeiro ponto da linha do tempo. */
export async function registrarCriacao(
  tenantId: string,
  orderId: string,
  autor: Autor
): Promise<void> {
  try {
    await prisma.orderEvent.create({
      data: {
        tenantId,
        orderId,
        type: "CRIADA" satisfies TipoEvento,
        actorId: autor.id,
        actorName: autor.nome,
      },
    })
  } catch (err) {
    console.error("Falha ao registrar criação da OS:", orderId, err)
  }
}

/** O retrato da OS como o histórico enxerga. */
export function retratoDaOs(o: {
  status: string
  technician?: { name: string } | null
  scheduledAt: Date | null
  totalAmount: unknown
  conclusionNote: string | null
  warrantyDays: number | null
}): RetratoDaOs {
  return {
    status: o.status,
    responsavel: o.technician?.name ?? null,
    agendadoEm: o.scheduledAt ? o.scheduledAt.toISOString() : null,
    valor: Number(o.totalAmount ?? 0),
    conclusao: o.conclusionNote,
    garantiaDias: o.warrantyDays,
  }
}

/** Quem está fazendo a mudança, com o nome já resolvido para o registro. */
export async function autorAtual(userId: string | null): Promise<Autor> {
  if (!userId) return { id: null, nome: null }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  return { id: userId, nome: u?.name ?? null }
}

/** A linha do tempo de uma OS, da mais nova pra mais velha. */
export async function historicoDaOs(tenantId: string, orderId: string) {
  return prisma.orderEvent.findMany({
    where: { tenantId, orderId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
}
