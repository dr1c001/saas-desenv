// Estoque de peças.
//
// A regra que sustenta tudo: o SALDO NUNCA É EDITADO DIRETAMENTE. Toda mudança
// é um movimento, e o saldo é a consequência. Sem isso, o histórico e o saldo
// passam a discordar e não há como saber qual dos dois está certo — que é
// exatamente o momento em que a empresa para de confiar no estoque e volta pro
// caderno.
//
// Por isso "corrigir o estoque" também é um movimento (AJUSTE), com o motivo
// escrito: contagem de inventário, peça quebrada, devolução ao fornecedor. Uma
// correção sem rastro é indistinguível de um erro.
//
// Módulo puro: conta de saldo errada some no meio de centenas de linhas e só
// aparece quando falta peça no caminhão.

export type TipoMovimento = "ENTRADA" | "SAIDA" | "AJUSTE"

/** Unidades que cobrem a esmagadora maioria dos casos. Texto livre viraria
 *  "un", "UN", "unid" e "unidade" na mesma lista, sem somar. */
export const UNIDADES = ["un", "cx", "m", "m2", "kg", "L", "h"] as const
export type Unidade = (typeof UNIDADES)[number]

export function unidadeValida(v: string): v is Unidade {
  return (UNIDADES as readonly string[]).includes(v)
}

/**
 * O saldo depois de aplicar um movimento.
 *
 * ENTRADA soma, SAIDA subtrai, AJUSTE **define** o valor — não soma nem
 * subtrai. É a diferença que mais confunde: quem conta a prateleira e acha 7
 * quer que fique 7, não que some 7 ao que o sistema achava que tinha.
 */
export function saldoApos(saldoAtual: number, tipo: TipoMovimento, quantidade: number): number {
  if (tipo === "AJUSTE") return arredondar(quantidade)
  if (tipo === "ENTRADA") return arredondar(saldoAtual + quantidade)
  return arredondar(saldoAtual - quantidade)
}

/**
 * A quantidade que o movimento de fato representa, para o histórico.
 *
 * No AJUSTE, o que interessa registrar é a DIFERENÇA: "ajustado para 7" sem
 * dizer de quanto veio não explica nada a quem lê depois.
 */
export function variacaoDo(
  saldoAtual: number,
  tipo: TipoMovimento,
  quantidade: number
): number {
  return arredondar(saldoApos(saldoAtual, tipo, quantidade) - saldoAtual)
}

/** Quantidade válida para um movimento. */
export function quantidadeValida(tipo: TipoMovimento, quantidade: number): boolean {
  if (!Number.isFinite(quantidade)) return false
  // AJUSTE aceita zero ("acabou"), os outros não: movimento de zero não move
  // nada e só sujaria o histórico.
  if (tipo === "AJUSTE") return quantidade >= 0
  return quantidade > 0
}

/**
 * Saldo negativo é permitido de propósito.
 *
 * O sistema não pode impedir o técnico de registrar a peça que ele JÁ usou só
 * porque o cadastro estava desatualizado — o serviço aconteceu no mundo real, e
 * recusar o registro só faz a empresa parar de registrar. O negativo fica
 * visível como pendência a acertar, que é a informação honesta.
 */
export function estaNegativo(saldo: number): boolean {
  return saldo < 0
}

/**
 * Quanto comprar para a peça voltar ao mínimo. A REGRA ÚNICA de reposição.
 *
 * ─── Por que ela mora aqui, e sozinha ────────────────────────────────────────
 *
 * A regra vivia em `compras-dinheiro.ts` e desistia quando o mínimo era zero:
 *
 *     if (minimo <= 0) return 0
 *
 * Consequência, achada na conta de um cliente: peça com saldo NEGATIVO e sem
 * mínimo definido pintava de VERMELHO na tela e valia ZERO na sugestão de
 * compra. O sistema gritava que estava faltando e nunca oferecia o conserto —
 * e saldo negativo é justamente a peça que o técnico já usou e não tinha.
 *
 * ─── Uma fórmula só, sem ramo ────────────────────────────────────────────────
 *
 * O alvo é o mínimo, e nunca menos que zero. Falta é o alvo menos o que se tem:
 *
 *   saldo -3, mínimo 0  ->  alvo 0, falta 3   (antes: 0 — o defeito)
 *   saldo -3, mínimo 5  ->  alvo 5, falta 8   (como já era)
 *   saldo  5, mínimo 5  ->  alvo 5, falta 0   (ver `abaixoDoMinimo`)
 *
 * Mora aqui, e não em compras: este é o módulo dono do alerta, e as duas
 * perguntas — "está faltando?" e "quanto pedir?" — têm de sair do mesmo lugar.
 */
export function quantoRepor(saldo: number, minimo: number): number {
  const alvo = Math.max(minimo, 0)
  const falta = alvo - saldo
  return falta > 0 ? arredondar(falta) : 0
}

/** Precisa repor? É `quantoRepor` acima de zero, e nada mais. */
export function precisaRepor(saldo: number, minimo: number): boolean {
  return quantoRepor(saldo, minimo) > 0
}

/**
 * Peça abaixo do mínimo definido pela empresa. Mínimo zero = sem alerta.
 *
 * CONTINUA INCLUSIVO (`<=`), e isso é decisão de produto, não descuido: o
 * mínimo aqui é PONTO DE PEDIDO, e avisar só depois de furá-lo é avisar tarde
 * — a última peça já saiu.
 *
 * Por isso ele e `quantoRepor` divergem de propósito num caso: saldo IGUAL ao
 * mínimo acende o alerta e não gera compra, porque comprar "até o mínimo"
 * quando já se está nele é comprar zero. Resolver isso de verdade exige um
 * segundo número — quanto pedir de cada vez — que a empresa ainda não informa.
 * Ver `quantoRepor`.
 */
export function abaixoDoMinimo(saldo: number, minimo: number): boolean {
  return minimo > 0 && saldo <= minimo
}

/** Situação da peça, para a tela pintar de uma cor só. */
export type Situacao = "negativo" | "abaixo" | "ok"

export function situacaoDa(saldo: number, minimo: number): Situacao {
  if (estaNegativo(saldo)) return "negativo"
  if (abaixoDoMinimo(saldo, minimo)) return "abaixo"
  return "ok"
}

/**
 * Três casas decimais: o mesmo que ServiceItem.quantity já usa no banco.
 *
 * Sem arredondar, somar 0.1 três vezes dá 0.30000000000000004 e o saldo passa
 * a carregar lixo binário que aparece na tela do cliente.
 */
function arredondar(n: number): number {
  return Math.round(n * 1000) / 1000
}
