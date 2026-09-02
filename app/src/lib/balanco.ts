// O BALANÇO PATRIMONIAL — o retrato do que a empresa tem e do que ela deve.
//
// ─── O limite honesto disto aqui, dito antes de qualquer número ──────────────
//
// Este balanço é GERENCIAL. Ele monta, com o que o sistema já sabe, a foto que
// o dono nunca tem: quanto a empresa tem, quanto deve, e o que sobra dela.
//
// Ele NÃO é o balanço legal. O balanço que vai para a Receita, para o banco ou
// para uma licitação é peça contábil, depende do regime tributário, segue as
// normas do CFC e é assinado por um contador habilitado. O que sai daqui é a
// BASE para esse trabalho — dado organizado em vez de planilha feita à mão —
// e o lugar onde o dono descobre o que falta antes de mandar para o contador.
//
// Dizer isso na primeira linha do arquivo é de propósito: um sistema que
// entrega um número contábil sem essa ressalva convida alguém a usá-lo como se
// fosse oficial, e a conta desse engano não é do sistema.
//
// ─── O que o sistema sabe sozinho, e o que ele precisa que digam ─────────────
//
// SABE: quanto entrou e saiu de dinheiro (Financeiro), quanto está para receber
// e para pagar, quanto vale o estoque, e quanto valem os bens já descontada a
// depreciação (lib/patrimonio.ts).
//
// NÃO SABE, e por isso pergunta:
//
//   - o CAIXA INICIAL — quanto a empresa tinha no dia em que começou a usar o
//     sistema. Sem isso, o caixa calculado é só o movimento desde então, e uma
//     empresa que já existia aparece com caixa negativo logo no primeiro mês;
//   - o CAPITAL SOCIAL — o que os sócios puseram na empresa;
//   - EMPRÉSTIMOS, financiamentos, imóveis não cadastrados, e qualquer outra
//     linha que viva fora do sistema. Estas entram como LINHAS MANUAIS.
//
// As linhas manuais são genéricas de propósito. A alternativa era um campo por
// tipo — `emprestimos`, `bancos`, `outrosAtivos` — e o quarto tipo, quando
// aparecesse, seria esquecido. Um grupo + descrição + valor cresce sozinho.
//
// Módulo puro: conta de dinheiro precisa ser testável sem banco.

export type GrupoDoBalanco =
  | "ATIVO_CIRCULANTE"
  | "ATIVO_NAO_CIRCULANTE"
  | "PASSIVO_CIRCULANTE"
  | "PASSIVO_NAO_CIRCULANTE"
  | "PATRIMONIO_LIQUIDO"

export const GRUPOS: readonly GrupoDoBalanco[] = [
  "ATIVO_CIRCULANTE",
  "ATIVO_NAO_CIRCULANTE",
  "PASSIVO_CIRCULANTE",
  "PASSIVO_NAO_CIRCULANTE",
  "PATRIMONIO_LIQUIDO",
]

/** Grupos que somam no ATIVO. O resto é origem de recurso. */
const DO_ATIVO: readonly GrupoDoBalanco[] = ["ATIVO_CIRCULANTE", "ATIVO_NAO_CIRCULANTE"]

export const ehGrupoDoAtivo = (g: GrupoDoBalanco) => DO_ATIVO.includes(g)

/** Uma linha que a empresa digitou à mão, porque vive fora do sistema. */
export type LinhaManual = {
  id?: string
  grupo: GrupoDoBalanco
  descricao: string
  valor: number
}

/** Os números crus, do jeito que o banco os entrega. */
export type NumerosDaEmpresa = {
  /** Quanto havia em caixa/banco quando a empresa começou a usar o sistema. */
  caixaInicial: number
  /** Receitas com status PAGO, somadas. */
  recebido: number
  /** Despesas com status PAGO, somadas. */
  pago: number
  /** Receitas em aberto (pendentes e vencidas). */
  aReceber: number
  /** Despesas em aberto (pendentes e vencidas). */
  aPagar: number
  /** Σ saldo × preço de custo das peças. */
  estoque: number
  /** Σ valor de aquisição dos bens NÃO baixados. */
  imobilizadoBruto: number
  /** Σ depreciação acumulada dos mesmos bens. */
  depreciacao: number
  capitalSocial: number
  manuais: readonly LinhaManual[]
}

/**
 * Uma linha do balanço pronta para a tela.
 *
 * `chave` é chave de tradução para as automáticas e texto puro para as manuais
 * — `automatica` diz qual das duas, e é o que a tela usa para decidir entre
 * traduzir e mostrar como está.
 */
export type LinhaDoBalanco = {
  chave: string
  valor: number
  automatica: boolean
  /** Só nas manuais, para o botão de apagar. */
  id?: string
}

export type GrupoMontado = {
  grupo: GrupoDoBalanco
  linhas: LinhaDoBalanco[]
  total: number
}

export type Balanco = {
  grupos: GrupoMontado[]
  ativo: number
  passivo: number
  patrimonioLiquido: number
  capitalSocial: number
  /** O que sobra do PL depois do capital e das linhas manuais de PL. */
  resultadoAcumulado: number
  /** O caixa calculado. PODE SER NEGATIVO — ver `caixa()`. */
  caixa: number
  /** Ativo = Passivo + PL. Verdadeiro por construção; conferido mesmo assim. */
  fecha: boolean
}

const centavos = (n: number) => Math.round(n * 100) / 100

const somar = (ns: readonly number[]) => centavos(ns.reduce((a, b) => a + b, 0))

/**
 * O caixa: o que havia no começo, mais o que entrou, menos o que saiu.
 *
 * PODE FICAR NEGATIVO, e fica mesmo — é o que acontece com toda empresa que
 * começou a usar o sistema no meio da vida e não informou o caixa inicial.
 *
 * Não travar em zero é decisão, e não descuido: um caixa preso em zero
 * esconderia exatamente o defeito que o balanço existe para mostrar, e o
 * conferente (lib/contador-agente.ts) não teria o que apontar. Número errado
 * visível se conserta; número errado escondido vira decisão errada.
 */
export function caixa(n: NumerosDaEmpresa): number {
  return centavos(n.caixaInicial + n.recebido - n.pago)
}

/** O imobilizado como o contador o lê: bruto, menos a depreciação. */
export function imobilizadoLiquido(n: NumerosDaEmpresa): number {
  return centavos(n.imobilizadoBruto - n.depreciacao)
}

function manuaisDoGrupo(manuais: readonly LinhaManual[], grupo: GrupoDoBalanco): LinhaDoBalanco[] {
  return manuais
    .filter((m) => m.grupo === grupo)
    .map((m) => ({ chave: m.descricao, valor: centavos(m.valor), automatica: false, id: m.id }))
}

/**
 * Monta o balanço.
 *
 * O patrimônio líquido sai POR DIFERENÇA (Ativo − Passivo), e não de uma
 * contabilidade de partidas dobradas — o sistema não tem uma. É por isso que a
 * identidade fecha sempre, e é por isso que `fecha` não é uma conferência de
 * verdade: ela é uma trava contra erro de programação daqui, e nada mais.
 *
 * O que o dono confere de verdade está no conferente: se o caixa faz sentido,
 * se o capital foi informado, se há recebível velho demais para valer o que
 * está escrito.
 */
export function montarBalanco(n: NumerosDaEmpresa): Balanco {
  const linhasCirculante: LinhaDoBalanco[] = [
    { chave: "caixa", valor: caixa(n), automatica: true },
    { chave: "aReceber", valor: centavos(n.aReceber), automatica: true },
    { chave: "estoque", valor: centavos(n.estoque), automatica: true },
    ...manuaisDoGrupo(n.manuais, "ATIVO_CIRCULANTE"),
  ]

  // Bruto e depreciação em DUAS linhas, e a depreciação negativa: é a forma
  // que o contador espera ler, e ela mostra quanto o bem já perdeu — que some
  // se só o líquido aparecer.
  const linhasNaoCirculante: LinhaDoBalanco[] = [
    { chave: "imobilizado", valor: centavos(n.imobilizadoBruto), automatica: true },
    { chave: "depreciacao", valor: centavos(-n.depreciacao), automatica: true },
    ...manuaisDoGrupo(n.manuais, "ATIVO_NAO_CIRCULANTE"),
  ]

  const linhasPassivoCirculante: LinhaDoBalanco[] = [
    { chave: "aPagar", valor: centavos(n.aPagar), automatica: true },
    ...manuaisDoGrupo(n.manuais, "PASSIVO_CIRCULANTE"),
  ]

  const linhasPassivoNaoCirculante = manuaisDoGrupo(n.manuais, "PASSIVO_NAO_CIRCULANTE")

  const ativo = somar([
    ...linhasCirculante.map((l) => l.valor),
    ...linhasNaoCirculante.map((l) => l.valor),
  ])
  const passivo = somar([
    ...linhasPassivoCirculante.map((l) => l.valor),
    ...linhasPassivoNaoCirculante.map((l) => l.valor),
  ])

  const patrimonioLiquido = centavos(ativo - passivo)
  const capitalSocial = centavos(n.capitalSocial)
  const manuaisDoPl = manuaisDoGrupo(n.manuais, "PATRIMONIO_LIQUIDO")
  const resultadoAcumulado = centavos(
    patrimonioLiquido - capitalSocial - somar(manuaisDoPl.map((l) => l.valor))
  )

  const linhasPl: LinhaDoBalanco[] = [
    { chave: "capitalSocial", valor: capitalSocial, automatica: true },
    ...manuaisDoPl,
    { chave: "resultadoAcumulado", valor: resultadoAcumulado, automatica: true },
  ]

  const grupos: GrupoMontado[] = [
    { grupo: "ATIVO_CIRCULANTE", linhas: linhasCirculante, total: somar(linhasCirculante.map((l) => l.valor)) },
    {
      grupo: "ATIVO_NAO_CIRCULANTE",
      linhas: linhasNaoCirculante,
      total: somar(linhasNaoCirculante.map((l) => l.valor)),
    },
    {
      grupo: "PASSIVO_CIRCULANTE",
      linhas: linhasPassivoCirculante,
      total: somar(linhasPassivoCirculante.map((l) => l.valor)),
    },
    {
      grupo: "PASSIVO_NAO_CIRCULANTE",
      linhas: linhasPassivoNaoCirculante,
      total: somar(linhasPassivoNaoCirculante.map((l) => l.valor)),
    },
    { grupo: "PATRIMONIO_LIQUIDO", linhas: linhasPl, total: patrimonioLiquido },
  ]

  return {
    grupos,
    ativo,
    passivo,
    patrimonioLiquido,
    capitalSocial,
    resultadoAcumulado,
    caixa: caixa(n),
    // Tolerância de um centavo: cada linha é arredondada antes de somar (mesma
    // convenção da nota fiscal e da cotação), e somas arredondadas por linha
    // divergem da soma arredondada no fim.
    fecha: Math.abs(ativo - (passivo + patrimonioLiquido)) < 0.011,
  }
}

/**
 * Lê o valor digitado numa linha manual.
 *
 * Aceita NEGATIVO, porque conta retificadora existe: "(-) Provisão para
 * perdas" é linha legítima do ativo.
 *
 * Campo VAZIO devolve `null`, e não zero. `Number("")` é 0, e aceitar isso
 * gravaria uma linha de R$ 0,00 toda vez que alguém salvasse sem preencher —
 * lixo no balanço, com nome e tudo, e nenhuma mensagem dizendo o que faltou.
 */
export function lerValorManual(valor: unknown): number | null {
  const texto = String(valor ?? "").trim()
  if (!texto) return null
  const n = Number(texto.replace(/\./g, "").replace(",", "."))
  if (!Number.isFinite(n)) return null
  return centavos(n)
}
