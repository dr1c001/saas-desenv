// O lado FINANCEIRO da compra.
//
// ─── O defeito que isto conserta ─────────────────────────────────────────────
//
// Até aqui a compra entrava no estoque e NÃO saía do caixa. A empresa comprava
// R$ 2.400 em peças, o saldo subia — e o Financeiro não ficava sabendo. O
// dinheiro saiu do mundo real e não saiu do sistema, então o lucro na tela era
// maior do que o lucro de verdade.
//
// Estoque que engorda sem despesa correspondente é a forma mais silenciosa de
// um sistema mentir sobre o resultado do mês.
//
// ─── E o custo médio ─────────────────────────────────────────────────────────
//
// O custo da peça era SOBRESCRITO pela última compra. Comprou 10 a R$ 80 e
// depois 2 a R$ 120, e o sistema passava a calcular tudo a R$ 120 — a margem
// aparecia menor do que é, em cima de um estoque que custou outra coisa.
//
// Módulo puro: contas de dinheiro precisam ser testáveis sem banco.

import { quantoRepor } from "@/lib/estoque"

/** Dinheiro, sempre em centavos fechados. */
const centavos = (n: number) => Math.round(n * 100) / 100

/**
 * O custo médio ponderado depois de receber uma quantidade nova.
 *
 * É a média do que está na prateleira com o que acabou de chegar, pesada pelas
 * quantidades — e não a última nota, que é o que havia antes.
 *
 * Casos de borda que importam:
 *
 *   - **estoque zerado**: o custo passa a ser o da compra nova, e não uma média
 *     com um custo antigo que não representa mais nada em prateleira nenhuma;
 *   - **sem custo anterior** (peça nova): idem;
 *   - **estoque negativo**: acontece quando a baixa chegou antes da entrada.
 *     Uma média ponderada por quantidade negativa produz número sem sentido —
 *     nesse caso vale o custo da compra nova.
 */
export function custoMedio(entrada: {
  estoqueAtual: number
  custoAtual: number | null
  quantidadeRecebida: number
  custoDaCompra: number
}): number {
  const { estoqueAtual, custoAtual, quantidadeRecebida, custoDaCompra } = entrada

  if (quantidadeRecebida <= 0) return centavos(custoAtual ?? custoDaCompra)
  if (estoqueAtual <= 0 || custoAtual === null || custoAtual <= 0) {
    return centavos(custoDaCompra)
  }

  const valorAntigo = estoqueAtual * custoAtual
  const valorNovo = quantidadeRecebida * custoDaCompra
  return centavos((valorAntigo + valorNovo) / (estoqueAtual + quantidadeRecebida))
}

export type Parcela = { numero: number; valor: number; vencimento: Date }

/**
 * Divide o valor da compra em parcelas mensais.
 *
 * ─── Por que a sobra vai na PRIMEIRA ────────────────────────────────────────
 *
 * R$ 100 em 3 vezes dá 33,333... Arredondar cada uma para 33,33 soma 99,99 e
 * some um centavo — que reaparece meses depois como diferença inexplicável na
 * conciliação. A sobra vai toda na primeira parcela (33,34 + 33,33 + 33,33),
 * que é como banco e boleto fazem, e o total fecha exato.
 *
 * A primeira parcela vence na data informada; as seguintes, de mês em mês.
 */
export function dividirEmParcelas(
  total: number,
  quantidade: number,
  primeiroVencimento: Date
): Parcela[] {
  // `Number.isFinite` ANTES do `Math.max`: `Math.max(1, NaN)` é NaN, e
  // `Array.from({ length: NaN })` devolve lista VAZIA — a despesa sumiria em
  // silêncio por causa de um campo mal preenchido. Pego pelo teste.
  const n = Number.isFinite(quantidade) ? Math.max(1, Math.floor(quantidade)) : 1
  const alvo = centavos(total)

  const base = Math.floor((alvo * 100) / n) / 100
  const sobra = centavos(alvo - base * n)

  return Array.from({ length: n }, (_, i) => {
    const vencimento = new Date(primeiroVencimento)
    // setMonth cuida da virada de ano sozinho. Dia 31 em mês de 30 escorrega
    // para o dia 1 do mês seguinte — comportamento do JavaScript, e aceitável:
    // o vencimento continua no lugar certo do calendário de cobrança.
    vencimento.setMonth(vencimento.getMonth() + i)
    return {
      numero: i + 1,
      valor: i === 0 ? centavos(base + sobra) : base,
      vencimento,
    }
  })
}

// `quantoComprar` morava aqui e FOI REMOVIDA.
//
// Ela era a segunda regra de "está faltando" — a primeira é o alerta da tela de
// peças — e as duas discordavam em dois casos, um deles caro: peça com saldo
// negativo e mínimo zero pintava de vermelho e valia ZERO na sugestão.
//
// Agora existe uma só, `quantoRepor` em lib/estoque.ts, que é o módulo dono do
// alerta. Duas regras para a mesma pergunta é como elas divergem.

export type PecaParaComprar = {
  id: string
  nome: string
  estoque: number
  minimo: number
  custo: number | null
}

/**
 * A lista de sugestão de compra.
 *
 * O sistema já sabe o que está abaixo do mínimo — o alerta usa isso todo dia.
 * Faltava transformar esse conhecimento numa ordem de compra em vez de deixar
 * o dono somar à mão o que precisa pedir.
 *
 * Ordena pelo que está MAIS FALTANDO, e não por nome: quem abre esta lista
 * quer resolver o pior caso primeiro.
 */
export function sugerirCompra(pecas: readonly PecaParaComprar[]) {
  return pecas
    .map((p) => ({ ...p, comprar: quantoRepor(p.estoque, p.minimo) }))
    .filter((p) => p.comprar > 0)
    .sort((a, b) => b.comprar - a.comprar)
}
