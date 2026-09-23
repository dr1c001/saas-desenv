// Os BENS da empresa — o que ela tem, quanto custou, e quanto vale hoje.
//
// ─── O que é um bem, e o que não é ───────────────────────────────────────────
//
// Bem é o que a empresa COMPROU PARA USAR: a van, a rotativa elétrica, o
// notebook, a bancada. Não é:
//
//   - PEÇA de estoque (`Part`) — comprada para revender ou aplicar no serviço,
//     e que sai do estoque quando usada;
//   - EQUIPAMENTO do cliente (`Equipment`) — o ar-condicionado que a empresa
//     faz manutenção, e que pertence a outra pessoa.
//
// São três coisas com cara parecida e naturezas opostas: uma é ativo da
// empresa, outra é mercadoria, e a terceira nem é dela.
//
// ─── Sobre a depreciação, e o limite honesto disto aqui ──────────────────────
//
// Os números daqui são GERENCIAIS. Servem para o dono saber quanto vale o que
// ele tem e para entregar dado organizado ao contador — não para substituir o
// contador. O balanço tem valor legal, depende do regime tributário da empresa
// e é peça que um profissional habilitado assina.
//
// As taxas padrão saem da tabela publicada pela Receita Federal (Anexo III da
// IN RFB 1.700/2017), que é a referência que o contador brasileiro usa. Elas
// são PADRÃO, não imposição: cada bem aceita a sua própria, porque o contador
// pode ter motivo para usar outra.
//
// Método LINEAR, que é o usado no Brasil: o mesmo valor todo mês, até zerar.
//
// Módulo puro: conta de dinheiro precisa ser testável sem banco.

export type CategoriaBem =
  | "VEICULO"
  | "MAQUINA"
  | "FERRAMENTA"
  | "INFORMATICA"
  | "MOVEL"
  | "IMOVEL"
  | "TERRENO"
  | "OUTRO"

export const CATEGORIAS: readonly CategoriaBem[] = [
  "VEICULO",
  "MAQUINA",
  "FERRAMENTA",
  "INFORMATICA",
  "MOVEL",
  "IMOVEL",
  "TERRENO",
  "OUTRO",
]

/**
 * Taxa anual de depreciação, em porcentagem, por categoria.
 *
 * Tabela da Receita Federal (Anexo III, IN RFB 1.700/2017) para as categorias
 * que ela cobre. `FERRAMENTA` e `OUTRO` não têm linha própria lá; usam 10%,
 * que é a taxa geral de máquinas e equipamentos.
 *
 * TERRENO é ZERO, e não é arredondamento: terreno **não deprecia**, porque não
 * se desgasta nem tem vida útil. É regra contábil, não escolha — e um sistema
 * que depreciasse terreno estaria produzindo um número errado com confiança.
 */
export const TAXA_ANUAL: Record<CategoriaBem, number> = {
  VEICULO: 20, // 5 anos
  MAQUINA: 10, // 10 anos
  FERRAMENTA: 10,
  INFORMATICA: 20, // 5 anos
  MOVEL: 10, // 10 anos
  IMOVEL: 4, // 25 anos — edificação
  TERRENO: 0, // não deprecia
  OUTRO: 10,
}

export type SituacaoBem =
  /** Em uso normal. */
  | "ATIVO"
  /** Parado para conserto. Continua sendo da empresa, e continua depreciando. */
  | "MANUTENCAO"
  /** Vendido, perdido ou descartado. Para de depreciar na data da baixa. */
  | "BAIXADO"

export const SITUACOES: readonly SituacaoBem[] = ["ATIVO", "MANUTENCAO", "BAIXADO"]

export type Bem = {
  categoria: CategoriaBem
  /** Quanto custou. */
  valorAquisicao: number
  aquisicaoEm: Date
  situacao: SituacaoBem
  /** Quando saiu do patrimônio. Só faz sentido em BAIXADO. */
  baixaEm?: Date | null
  /**
   * Taxa própria deste bem, quando a empresa quer uma diferente da padrão.
   * `null` usa a da categoria.
   */
  taxaAnual?: number | null
  /**
   * Quanto se espera receber ao vender no fim da vida útil. Não deprecia.
   * `null`/0 é o comum no Brasil para fins fiscais.
   */
  valorResidual?: number | null
}

const centavos = (n: number) => Math.round(n * 100) / 100

/** A taxa que vale para este bem: a dele, ou a da categoria. */
export function taxaDoBem(bem: Bem): number {
  // `?? ` e não `||`: taxa ZERO é uma escolha legítima (bem que a empresa
  // decidiu não depreciar), e `||` a trocaria pela da categoria.
  const propria = bem.taxaAnual ?? null
  if (propria !== null && Number.isFinite(propria) && propria >= 0) return propria
  return TAXA_ANUAL[bem.categoria] ?? 0
}

/** Quanto do valor pode depreciar: o que custou menos o que sobra no fim. */
export function valorDepreciavel(bem: Bem): number {
  const residual = Math.max(0, bem.valorResidual ?? 0)
  return Math.max(0, centavos(bem.valorAquisicao - residual))
}

/**
 * Meses INTEIROS entre duas datas.
 *
 * Depreciação linear no Brasil conta por mês, e não por dia: um bem comprado
 * dia 28 deprecia o mês inteiro. Contar por dia daria números que não batem
 * com nenhuma tabela que o contador vai conferir.
 */
export function mesesEntre(de: Date, ate: Date): number {
  const meses =
    (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
  return Math.max(0, meses)
}

/**
 * Quanto já depreciou, até a data informada.
 *
 * Nunca passa do valor depreciável: depois de totalmente depreciado o bem
 * continua na lista pelo valor residual, e não vira número negativo.
 *
 * Bem BAIXADO para de depreciar na data da baixa — depois dela ele não é mais
 * da empresa, e continuar depreciando inventaria despesa.
 */
export function depreciacaoAcumulada(bem: Bem, ate: Date): number {
  const taxa = taxaDoBem(bem)
  if (taxa <= 0) return 0

  const depreciavel = valorDepreciavel(bem)
  if (depreciavel <= 0) return 0

  // Bem baixado congela na data da baixa. Sem `baixaEm`, congela onde está.
  const fim =
    bem.situacao === "BAIXADO" && bem.baixaEm && bem.baixaEm < ate ? bem.baixaEm : ate

  const meses = mesesEntre(bem.aquisicaoEm, fim)
  if (meses <= 0) return 0

  const porMes = (depreciavel * (taxa / 100)) / 12
  return centavos(Math.min(depreciavel, porMes * meses))
}

/**
 * Quanto o bem vale hoje nos livros: o que custou menos o que já depreciou.
 *
 * É o número que entra no balanço como ativo imobilizado.
 */
export function valorContabil(bem: Bem, ate: Date): number {
  return centavos(bem.valorAquisicao - depreciacaoAcumulada(bem, ate))
}

/** Quantos meses faltam até o bem estar totalmente depreciado. */
export function mesesRestantes(bem: Bem, ate: Date): number | null {
  const taxa = taxaDoBem(bem)
  if (taxa <= 0) return null // não deprecia: não há "fim"

  const vidaEmMeses = Math.round((100 / taxa) * 12)
  const decorridos = mesesEntre(bem.aquisicaoEm, ate)
  return Math.max(0, vidaEmMeses - decorridos)
}

export type ResumoDoPatrimonio = {
  /** Quantos bens ativos (não baixados). */
  quantidade: number
  /** Soma do que foi pago por eles. */
  totalAquisicao: number
  /** Soma do que já depreciou. */
  totalDepreciado: number
  /** Soma do valor contábil — o que entra no balanço. */
  totalContabil: number
}

/**
 * O resumo do patrimônio, para o topo da tela e para o balanço.
 *
 * Bens BAIXADOS ficam de fora: eles não são mais da empresa, e somá-los faria o
 * ativo imobilizado contar coisa vendida.
 */
export function resumirPatrimonio(bens: readonly Bem[], ate: Date): ResumoDoPatrimonio {
  const vivos = bens.filter((b) => b.situacao !== "BAIXADO")
  let aquisicao = 0
  let depreciado = 0
  for (const b of vivos) {
    aquisicao += b.valorAquisicao
    depreciado += depreciacaoAcumulada(b, ate)
  }
  return {
    quantidade: vivos.length,
    totalAquisicao: centavos(aquisicao),
    totalDepreciado: centavos(depreciado),
    totalContabil: centavos(aquisicao - depreciado),
  }
}

/** Lê a taxa digitada. Vazio, letra e negativo viram `null` (usa a padrão). */
export function lerTaxa(valor: unknown): number | null {
  if (valor === "" || valor === null || valor === undefined) return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}
