// Regra das ordens de compra.
//
// Módulo puro: o status de uma compra decide se ela ainda cobra o fornecedor,
// se some da lista de pendências e se pode ser cancelada. Errar isso faz a
// empresa cobrar entrega que já chegou — ou pior, esquecer a que não chegou.

export type StatusCompra = "RASCUNHO" | "ENVIADA" | "PARCIAL" | "RECEBIDA" | "CANCELADA"

export type ItemRecebido = {
  /** Quanto foi pedido. */
  pedido: number
  /** Quanto já chegou, somando todos os recebimentos. */
  recebido: number
}

/**
 * O status depois de registrar um recebimento.
 *
 * RECEBIDA só quando TODO item chegou por inteiro. Entrega parcial é a regra e
 * não a exceção — fornecedor mandar 8 de 10 é comum, e um sistema que só
 * aceita "tudo ou nada" faz a empresa parar de registrar e voltar pro caderno.
 *
 * Recebido a MAIS que o pedido conta como completo: o fornecedor mandou
 * sobrando, e ficar eternamente "parcial" por causa disso seria absurdo.
 */
export function statusAposRecebimento(itens: ItemRecebido[]): StatusCompra {
  if (itens.length === 0) return "ENVIADA"
  const tudoCompleto = itens.every((i) => i.recebido >= i.pedido)
  if (tudoCompleto) return "RECEBIDA"
  const algoChegou = itens.some((i) => i.recebido > 0)
  return algoChegou ? "PARCIAL" : "ENVIADA"
}

/** O que ainda falta chegar de um item. Nunca negativo. */
export function faltaReceber(item: ItemRecebido): number {
  return Math.max(0, arredondar(item.pedido - item.recebido))
}

/**
 * A compra pode ser cancelada?
 *
 * Recebida ou parcial não: o estoque já entrou, e desfazer daqui deixaria
 * saldo e histórico discordando. Devolver ao fornecedor é um movimento de
 * saída, que fica registrado como tal.
 */
export function podeCancelar(status: StatusCompra): boolean {
  return status === "RASCUNHO" || status === "ENVIADA"
}

/** Ainda se espera alguma coisa desta compra? */
export function estaPendente(status: StatusCompra): boolean {
  return status === "ENVIADA" || status === "PARCIAL"
}

/** Total da compra a partir dos itens. */
export function totalDaCompra(itens: { quantity: number; unitCost: number }[]): number {
  return arredondar(itens.reduce((s, i) => s + i.quantity * i.unitCost, 0), 2)
}

function arredondar(n: number, casas = 3): number {
  const f = 10 ** casas
  return Math.round(n * f) / f
}
