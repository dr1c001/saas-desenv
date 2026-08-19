// O núcleo transacional do estoque.
//
// Mora fora de actions/ porque três caminhos diferentes precisam dele — o
// movimento manual, a baixa pela OS e o recebimento da ordem de compra — e um
// arquivo "use server" só pode exportar Server Action. Ter três cópias da
// mesma conta seria a forma mais fácil de o saldo e o histórico divergirem.
//
// A regra: saldo e movimento são gravados na MESMA transação, sempre. Se um
// dos dois falhar, nenhum vale. É isso que sustenta a invariante de que a soma
// dos movimentos de uma peça é igual ao saldo dela.

import { Prisma } from "@/generated/prisma/client"
import { saldoApos, variacaoDo, type TipoMovimento } from "@/lib/estoque"

/** O cliente dentro de uma transação do Prisma. */
export type Tx = Prisma.TransactionClient

export type PedidoDeMovimento = {
  tenantId: string
  partId: string
  tipo: TipoMovimento
  /** Positiva. No AJUSTE, é o saldo contado — não a diferença. */
  quantidade: number
  motivo?: string | null
  orderId?: string | null
  purchaseOrderId?: string | null
  userId?: string | null
}

/**
 * Aplica um movimento e devolve o saldo novo.
 *
 * Lê o saldo DENTRO da transação, imediatamente antes de escrever. Ler fora
 * abriria janela pra duas baixas simultâneas partirem do mesmo saldo e uma
 * sobrescrever a outra — o clássico "sumiu peça do estoque e ninguém mexeu".
 *
 * A peça é buscada com o tenantId no filtro: sem isso, um partId de outra
 * empresa movimentaria o estoque alheio.
 */
export async function aplicarMovimento(tx: Tx, p: PedidoDeMovimento): Promise<number> {
  const peca = await tx.part.findFirst({
    where: { id: p.partId, tenantId: p.tenantId },
    select: { id: true, stock: true },
  })
  if (!peca) throw new Error("Peça não encontrada.")

  const saldoAtual = Number(peca.stock)
  const novo = saldoApos(saldoAtual, p.tipo, p.quantidade)
  const variacao = variacaoDo(saldoAtual, p.tipo, p.quantidade)

  await tx.part.update({ where: { id: peca.id }, data: { stock: novo } })
  await tx.stockMovement.create({
    data: {
      tenantId: p.tenantId,
      partId: peca.id,
      type: p.tipo,
      // Com sinal: a soma dos movimentos tem que reproduzir o saldo.
      quantity: variacao,
      balanceAfter: novo,
      reason: p.motivo ?? null,
      orderId: p.orderId ?? null,
      purchaseOrderId: p.purchaseOrderId ?? null,
      userId: p.userId ?? null,
    },
  })

  return novo
}

/**
 * Baixa do estoque as peças consumidas por uma OS concluída.
 *
 * **Idempotente.** A conclusão pode ser disparada mais de uma vez — o botão
 * clicado duas vezes, a OS reaberta e concluída de novo, uma reexecução do
 * fluxo. Sem a guarda, cada passagem tiraria as peças outra vez e o saldo
 * afundaria sem ninguém entender por quê. A checagem é "já existe movimento
 * desta OS?", que é o índice `StockMovement.orderId`.
 *
 * **Nunca lança.** O serviço foi feito no mundo real; recusar a conclusão da
 * OS porque o estoque não fechou seria travar o trabalho por causa da
 * contabilidade. Falha aqui vira log, e o saldo se acerta por ajuste — que é
 * pra isso que o ajuste existe.
 */
export async function baixarPecasDaOs(
  prisma: { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>; stockMovement: Tx["stockMovement"]; serviceItem: Tx["serviceItem"] },
  tenantId: string,
  orderId: string,
  userId: string | null
): Promise<{ baixadas: number }> {
  try {
    const jaBaixou = await prisma.stockMovement.findFirst({
      where: { orderId, type: "SAIDA" },
      select: { id: true },
    })
    if (jaBaixou) return { baixadas: 0 }

    const itens = await prisma.serviceItem.findMany({
      where: { orderId, partId: { not: null } },
      select: { partId: true, quantity: true },
    })
    if (itens.length === 0) return { baixadas: 0 }

    let baixadas = 0
    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        const quantidade = Number(item.quantity)
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue
        await aplicarMovimento(tx, {
          tenantId,
          partId: item.partId!,
          tipo: "SAIDA",
          quantidade,
          motivo: null,
          orderId,
          userId,
        })
        baixadas++
      }
    })
    return { baixadas }
  } catch (e) {
    console.error("Falha ao baixar peças do estoque da OS:", orderId, e)
    return { baixadas: 0 }
  }
}

/**
 * O próximo número sequencial de ordem de compra do tenant.
 *
 * Mesmo padrão da numeração de OS: por empresa, começando em 1. Dentro da
 * transação, pra dois pedidos simultâneos não receberem o mesmo número — o
 * @@unique([tenantId, number]) recusaria o segundo, e é melhor recusar do que
 * gravar duplicado.
 */
export async function proximoNumeroDeCompra(tx: Tx, tenantId: string): Promise<number> {
  const ultima = await tx.purchaseOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (ultima?.number ?? 0) + 1
}
