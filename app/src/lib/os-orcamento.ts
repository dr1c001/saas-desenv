// A visita que vira orçamento.
//
// ─── O caso real ─────────────────────────────────────────────────────────────
//
// O cliente liga, a empresa abre a OS, o técnico vai até o endereço — e no
// local descobre que o serviço é maior do que o telefonema sugeria. O cliente
// então só quer saber quanto custa.
//
// Até aqui essa visita virava uma OS que ninguém sabia o que fazer: fechar com
// valor cheio seria cobrar um serviço que não houve; cancelar apagaria o
// deslocamento que aconteceu de verdade.
//
// ─── A taxa de visita é DE CADA EMPRESA ──────────────────────────────────────
//
// Umas cobram o deslocamento mesmo com o orçamento recusado — combustível e
// duas horas do técnico foram gastos. Outras absorvem, porque a visita é o
// custo de vender. O sistema não escolhe: `0` (o padrão) fecha em zero, e
// qualquer valor fecha com ele.
//
// Módulo puro: a decisão de quanto a OS vale precisa ser testável sem banco.

export type StatusOrcamento = "DRAFT" | "SENT" | "APPROVED" | "REJECTED"

/** O que a OS deve fazer, dado o orçamento que saiu dela. */
export type SituacaoDaVisita =
  /** Não há orçamento: OS comum, fecha pelo que tem. */
  | "semOrcamento"
  /** Orçamento existe e o cliente ainda não respondeu. */
  | "aguardando"
  /** Cliente aprovou: o serviço vai acontecer. */
  | "aprovado"
  /** Cliente recusou: a OS fecha só com a taxa de visita. */
  | "recusado"

export function situacaoDaVisita(status: StatusOrcamento | null | undefined): SituacaoDaVisita {
  if (!status) return "semOrcamento"
  if (status === "APPROVED") return "aprovado"
  if (status === "REJECTED") return "recusado"
  // DRAFT e SENT são a mesma coisa para a OS: o cliente ainda não decidiu.
  // Separá-los faria a tela tratar "não terminei de escrever" e "mandei e
  // estou esperando" de formas diferentes, sem que a OS mude por isso.
  return "aguardando"
}

/**
 * Por quanto a OS fecha.
 *
 * A regra que importa: **orçamento recusado não vira receita do serviço**.
 * Fecha com a taxa de visita da empresa — que pode ser zero, e zero é o padrão.
 *
 * O `INVOICED` só cria receita quando o total é maior que zero (ver
 * `actions/service-orders.ts`), então fechar em zero já não gera cobrança
 * nenhuma por construção. Esta função não depende disso, mas convém saber.
 */
export function valorDeFechamento(entrada: {
  situacao: SituacaoDaVisita
  /** O que os itens da OS somam. */
  totalDosItens: number
  /** A taxa da empresa. 0 = não cobra visita. */
  taxaDeVisita: number
}): number {
  const { situacao, totalDosItens, taxaDeVisita } = entrada
  if (situacao !== "recusado") return totalDosItens

  // Recusado: só a visita. Nunca negativo, e nunca o valor dos itens — que são
  // justamente o serviço que o cliente decidiu não fazer.
  return Math.max(0, taxaDeVisita)
}

/**
 * A OS pode ser faturada agora?
 *
 * Faturar com o orçamento em aberto é o erro caro: cobra-se um serviço que o
 * cliente ainda não aprovou. Não é proibido — a empresa pode ter combinado por
 * telefone — mas a tela avisa antes.
 */
export function avisoAoFechar(situacao: SituacaoDaVisita): "aguardando" | null {
  return situacao === "aguardando" ? "aguardando" : null
}

/** A taxa gravada é utilizável? Texto vazio, letra e negativo viram zero. */
export function lerTaxaDeVisita(valor: unknown): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  // Duas casas: é dinheiro.
  return Math.round(n * 100) / 100
}

/**
 * O orçamento pode ser gerado a partir desta OS?
 *
 * OS cancelada não gera: o deslocamento não aconteceu, ou foi desfeito. OS
 * faturada também não: o dinheiro já foi cobrado, e um orçamento depois disso
 * inverteria a ordem dos fatos.
 */
export function podeGerarOrcamento(statusDaOs: string): boolean {
  return statusDaOs !== "CANCELLED" && statusDaOs !== "INVOICED"
}
