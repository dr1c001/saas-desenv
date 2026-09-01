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
import { LOCAL_PADRAO, localPadrao, type Local } from "@/lib/estoque-local"

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
  /**
   * EM QUAL local. Obrigatório desde 01/09/2026.
   *
   * Sem ele o movimento mexeria no total da empresa sem dizer de onde saiu a
   * peça — e o total deixaria de ser a soma dos locais no instante seguinte.
   * Quem chama resolve o local antes (ver `localPadrao` em lib/estoque-local).
   */
  locationId: string
  /** Só na perna de saída de uma transferência: para onde foi. */
  toLocationId?: string | null
  /** Liga as duas pernas da mesma transferência. */
  transferId?: string | null
}

/**
 * Em qual local este movimento acontece.
 *
 * Existe para os três caminhos que mexem no estoque (movimento manual, baixa
 * pela OS, recebimento de compra) não repetirem a mesma escolha — e escolherem
 * diferente com o tempo, que é como o saldo de um local começa a não bater.
 *
 * ─── Cria o almoxarifado quando não há nenhum ──────────────────────────────
 *
 * A migração só criou local para quem JÁ tinha peça cadastrada. Empresa nova, e
 * empresa que ativou o estoque depois, chega aqui sem local nenhum — e recusar
 * o movimento por causa disso seria pedir que ela adivinhe que precisa criar um
 * lugar antes de guardar a primeira peça.
 *
 * Mesmo padrão do bucket de fotos, que também se cria sozinho no primeiro uso.
 */
export async function resolverLocal(
  tx: Tx,
  tenantId: string,
  userId: string | null,
  escolhido?: string | null
): Promise<string> {
  const locais = await tx.stockLocation.findMany({
    where: { tenantId },
    select: { id: true, name: true, type: true, userId: true, active: true },
  })

  // O escolhido só vale se for DESTA empresa e estiver ativo: um id de outra
  // moveria estoque alheio, e um inativo esconderia o saldo assim que gravado.
  if (escolhido) {
    const valido = locais.find((l) => l.id === escolhido && l.active)
    if (valido) return valido.id
  }

  const comoRegra: Local[] = locais.map((l) => ({
    id: l.id,
    nome: l.name,
    tipo: l.type,
    userId: l.userId,
    ativo: l.active,
  }))
  const padrao = localPadrao(comoRegra, userId)
  if (padrao) return padrao.id

  const criado = await tx.stockLocation.create({
    data: { tenantId, name: LOCAL_PADRAO, type: "ALMOXARIFADO" },
    select: { id: true },
  })
  return criado.id
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

  // ─── O saldo DO LOCAL, que é o que o movimento realmente mexe ────────────
  //
  // Lido dentro da transação, imediatamente antes de escrever, pelo mesmo
  // motivo do total: duas baixas simultâneas partindo do mesmo saldo fariam
  // uma sobrescrever a outra.
  const doLocal = await tx.stockBalance.findUnique({
    where: { partId_locationId: { partId: peca.id, locationId: p.locationId } },
    select: { id: true, quantity: true },
  })
  const saldoNoLocal = Number(doLocal?.quantity ?? 0)
  const novoNoLocal = saldoApos(saldoNoLocal, p.tipo, p.quantidade)

  // A variação sai do saldo DO LOCAL, e não do total: no AJUSTE a quantidade é
  // o saldo contado, e contar 3 numa van que tinha 5 é uma variação de -2 ali,
  // qualquer que seja o total da empresa.
  const variacao = variacaoDo(saldoNoLocal, p.tipo, p.quantidade)

  // O total acompanha pela VARIAÇÃO, e nunca é recalculado a partir da
  // quantidade: recalcular faria um ajuste num local zerar o estoque dos
  // outros, porque `saldoApos` no AJUSTE devolve o valor contado.
  const saldoAtual = Number(peca.stock)
  const novo = Math.round((saldoAtual + variacao) * 1000) / 1000

  await tx.part.update({ where: { id: peca.id }, data: { stock: novo } })

  // `upsert` porque a peça pode nunca ter estado neste local — é o caso da
  // primeira entrada numa van nova.
  await tx.stockBalance.upsert({
    where: { partId_locationId: { partId: peca.id, locationId: p.locationId } },
    create: { partId: peca.id, locationId: p.locationId, quantity: novoNoLocal },
    update: { quantity: novoNoLocal },
  })

  await tx.stockMovement.create({
    data: {
      tenantId: p.tenantId,
      partId: peca.id,
      type: p.tipo,
      // Com sinal: a soma dos movimentos tem que reproduzir o saldo.
      quantity: variacao,
      // O saldo DAQUELE local — não o total. É o que o histórico do local
      // precisa contar para fazer sentido lido de cima para baixo.
      balanceAfter: novoNoLocal,
      reason: p.motivo ?? null,
      orderId: p.orderId ?? null,
      purchaseOrderId: p.purchaseOrderId ?? null,
      userId: p.userId ?? null,
      locationId: p.locationId,
      toLocationId: p.toLocationId ?? null,
      transferId: p.transferId ?? null,
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
      // A peça sai de ONDE ELA ESTAVA: a van de quem executou, quando ele tem
      // uma. Baixar sempre do almoxarifado faria a van acumular peça já usada
      // e o depósito ficar negativo sem ninguém ter tirado nada de lá.
      //
      // Resolvido UMA vez fora do laço: todas as peças da mesma OS saem do
      // mesmo lugar, e repetir a consulta por item seria uma ida ao banco por
      // peça dentro da transação.
      const locationId = await resolverLocal(tx, tenantId, userId ?? null)

      for (const item of itens) {
        const quantidade = Number(item.quantity)
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue
        await aplicarMovimento(tx, {
          tenantId,
          partId: item.partId!,
          locationId,
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
