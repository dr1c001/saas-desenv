// Caixa ou competência: em que mês cada lançamento entra no resultado.
//
// ─── O erro que isto conserta ────────────────────────────────────────────────
//
// O DRE somava receita e despesa por data de PAGAMENTO. Um serviço executado e
// recebido em janeiro, cuja comissão vence dia 5 de fevereiro, punha a receita
// em janeiro e o custo dela em fevereiro:
//
//   janeiro   → lucro inflado (receita sem o custo que a gerou)
//   fevereiro → prejuízo artificial (custo sem a receita que o justificou)
//
// Todo mês, na mesma direção. E ninguém percebe, porque os dois números são
// plausíveis — janeiro só parece um mês bom.
//
// ─── Por que os DOIS regimes continuam existindo ─────────────────────────────
//
// Não é que caixa esteja errado. Para quem tem uma empresa pequena, "quanto
// entrou e quanto saiu neste mês" é a pergunta que decide se dá para comprar a
// van — e essa pergunta é de caixa.
//
// Competência responde outra: "este mês deu lucro?". As duas são legítimas, e
// dão números diferentes de propósito. O que estava errado era existir só uma e
// ela ser apresentada como se respondesse as duas.
//
// O padrão continua CAIXA — trocá-lo faria todos os meses que o dono já
// conferiu mudarem de valor de um dia para o outro, sem ele ter pedido.
//
// Módulo puro: é a regra que decide de qual mês é cada real.

export type Regime = "caixa" | "competencia"

export const REGIMES: readonly Regime[] = ["caixa", "competencia"]

export const REGIME_PADRAO: Regime = "caixa"

export function regimeValido(v: string): v is Regime {
  return (REGIMES as readonly string[]).includes(v)
}

/** Um lançamento, do ponto de vista de "a que mês ele pertence". */
export type Lancamento = {
  /** Quando o dinheiro se moveu. Nulo enquanto não se moveu. */
  paidAt: Date | null
  /** Quando era devido. */
  dueDate: Date
  /** Quando o fato aconteceu. Nulo nos lançamentos antigos e nos manuais. */
  accrualDate: Date | null
  status: string
}

/**
 * A data que decide de qual mês é este lançamento, no regime escolhido.
 *
 * `null` quando ele não entra no resultado — o caso do lançamento ainda não
 * pago, em regime de caixa: ele não é uma dívida esquecida, é dinheiro que
 * ainda não se moveu.
 */
export function dataDoResultado(l: Lancamento, regime: Regime): Date | null {
  if (regime === "caixa") {
    // Só o que foi pago. É a definição de caixa, e é o comportamento que o DRE
    // sempre teve.
    return l.status === "PAID" && l.paidAt ? l.paidAt : null
  }

  // Competência: o fato conta, tenha o dinheiro se movido ou não. Um serviço
  // entregue em setembro é resultado de setembro mesmo que o cliente só pague
  // em outubro — é justamente essa a pergunta que este regime responde.
  return dataDeCompetencia(l)
}

/**
 * Quando o fato aconteceu.
 *
 * O vencimento é o substituto quando não há data própria, e não o pagamento:
 * `dueDate` é o que a pessoa digitou pensando no mês do lançamento, enquanto
 * `paidAt` é exatamente o que a competência existe para NÃO usar. Cair no
 * pagamento faria o regime novo devolver os mesmos números do antigo para todo
 * lançamento antigo — e daria a impressão de que nada mudou.
 */
export function dataDeCompetencia(l: {
  dueDate: Date
  accrualDate: Date | null
}): Date {
  return l.accrualDate ?? l.dueDate
}

/**
 * Está dentro do período?
 *
 * Fim EXCLUSIVO, como o resto dos relatórios: o limite é a meia-noite do dia
 * seguinte, e não 23:59:59, para não perder o último segundo do dia.
 */
export function dentroDoPeriodo(data: Date | null, inicio: Date, fim: Date): boolean {
  if (!data) return false
  const t = data.getTime()
  return t >= inicio.getTime() && t < fim.getTime()
}
