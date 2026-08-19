"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { completeServiceOrder, updateOrderStatus } from "@/actions/service-orders"
import type { Operacao, Veredito } from "@/lib/fila-offline"

export type RespostaDaSincronizacao = { id: string; veredito: Veredito }

/**
 * Aplica um lote de operações que o técnico fez sem sinal.
 *
 * **Idempotente por construção.** O `id` vem do celular e é chave primária de
 * `OfflineOperation`. A gravação desse registro acontece ANTES de aplicar o
 * efeito, dentro da mesma checagem: se já existe, devolve "repetida" e não
 * toca em nada. Sem isso, uma resposta perdida no caminho faria o técnico
 * reenviar e a OS ser concluída duas vezes — duas receitas e estoque baixado
 * em dobro, que ninguém percebe até o financeiro não fechar.
 *
 * **Não sobrescreve em silêncio.** A OS pode ter mudado enquanto o celular
 * estava sem rede: outra pessoa concluiu, faturou ou cancelou. Nesses casos a
 * operação é RECUSADA com motivo, e o técnico vê o motivo na tela. Aplicar por
 * cima seria desfazer o trabalho de quem estava com sinal.
 *
 * Uma operação que falha não derruba as outras: cada uma tem seu veredito. Um
 * lote que aborta inteiro por causa de uma OS cancelada faria o técnico perder
 * as outras cinco conclusões do dia.
 */
export async function sincronizar(
  operacoes: Operacao[]
): Promise<RespostaDaSincronizacao[]> {
  const { tenantId, userId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const respostas: RespostaDaSincronizacao[] = []

  for (const op of operacoes) {
    try {
      respostas.push({ id: op.id, veredito: await aplicar(op, tenantId, userId) })
    } catch (e) {
      // Erro inesperado vira "falhou", não "recusada": falhou é reversível e a
      // fila tenta de novo. Marcar como recusada descartaria trabalho de campo
      // por causa de um problema momentâneo do servidor.
      console.error("[sync] operação falhou:", op.id, e)
      respostas.push({
        id: op.id,
        veredito: { estado: "falhou", motivo: e instanceof Error ? e.message : "erro" },
      })
    }
  }

  return respostas
}

async function aplicar(
  op: Operacao,
  tenantId: string,
  userId: string
): Promise<Veredito> {
  // ── A trava de idempotência ───────────────────────────────────────────────
  const jaAplicada = await prisma.offlineOperation.findUnique({
    where: { id: op.id },
    select: { outcome: true, reason: true },
  })
  if (jaAplicada) {
    // Se da primeira vez foi recusada, continua recusada — a informação que
    // interessa ao técnico é o motivo, não "repetida".
    return jaAplicada.outcome === "recusada"
      ? { estado: "recusada", motivo: jaAplicada.reason ?? "recusada antes" }
      : { estado: "repetida" }
  }

  // A OS precisa ser DESTA empresa. Sem o filtro, um orderId de outra empresa
  // seria concluído por aqui — a fila vem do cliente e não é confiável.
  const os = await prisma.serviceOrder.findFirst({
    where: { id: op.orderId, tenantId },
    select: { id: true, status: true },
  })

  const registrar = async (v: Veredito) => {
    await prisma.offlineOperation.create({
      data: {
        id: op.id,
        tenantId,
        userId,
        type: op.tipo,
        orderId: op.orderId,
        outcome: v.estado === "recusada" ? "recusada" : "aplicada",
        reason: v.estado === "recusada" ? v.motivo : null,
        clientAt: new Date(op.criadaEm),
      },
    })
    return v
  }

  if (!os) return registrar({ estado: "recusada", motivo: "osNaoEncontrada" })

  if (op.tipo === "CONCLUIR_OS") {
    // Já concluída ou faturada: não sobrescreve. Quem estava com sinal já
    // resolveu, e o texto de conclusão daqui é mais velho que o de lá.
    if (os.status === "INVOICED") return registrar({ estado: "recusada", motivo: "jaFaturada" })
    if (os.status === "DONE") return registrar({ estado: "recusada", motivo: "jaConcluida" })
    if (os.status === "CANCELLED") return registrar({ estado: "recusada", motivo: "cancelada" })

    // Grava o registro ANTES de aplicar: se o efeito rodar e a gravação
    // falhar, a próxima tentativa aplicaria de novo. Na ordem inversa, o pior
    // caso é uma operação marcada como aplicada sem ter aplicado — visível e
    // corrigível à mão, ao contrário de dinheiro duplicado.
    await registrar({ estado: "aplicada" })
    await completeServiceOrder(
      op.orderId,
      op.dados.conclusionNote ?? "",
      op.dados.items ?? [],
      op.dados.invoiceImmediately ?? false
    )
    return { estado: "aplicada" }
  }

  if (op.tipo === "MUDAR_STATUS") {
    const novo = op.dados.status
    if (!novo) return registrar({ estado: "recusada", motivo: "statusInvalido" })
    if (os.status === "INVOICED") return registrar({ estado: "recusada", motivo: "jaFaturada" })
    // Já está no status pedido: não é erro, é a realidade alcançada por outro
    // caminho. Tratar como recusa deixaria pendência eterna na tela do técnico.
    if (os.status === novo) return registrar({ estado: "aplicada" })

    await registrar({ estado: "aplicada" })
    await updateOrderStatus(op.orderId, novo)
    return { estado: "aplicada" }
  }

  return registrar({ estado: "recusada", motivo: "tipoDesconhecido" })
}
