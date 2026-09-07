// Entrada à vista mais saldo a prazo: como o cliente combina pagar.
//
// ─── O caso real ─────────────────────────────────────────────────────────────
//
// "A empresa fez um trabalho, o cliente pediu para faturar e emitir nota, e
//  além disso pediu prazo. O serviço ficou R$ 2.000, ele paga R$ 500 à vista e
//  pede prazo para 7 dias após a execução. Tem cliente que pede 7, ou 15, ou 30
//  dias para concluir o pagamento."
//
// ─── O que o sistema fazia ───────────────────────────────────────────────────
//
// Faturar criava UMA receita, com vencimento HOJE e o valor cheio. Um serviço
// de R$ 2.000 com R$ 500 de entrada aparecia como R$ 2.000 vencendo hoje: o
// dono via em atraso no dia seguinte um valor que ninguém combinou pagar hoje,
// e não tinha onde registrar o que combinou de verdade.
//
// ─── Por que uma receita POR PARCELA ─────────────────────────────────────────
//
// Porque cada parcela tem vencimento próprio, é paga em dia próprio e vira
// cobrança própria. Guardar "R$ 2.000 em 3x" numa linha só obrigaria a inventar
// um estado meio-pago, e a régua de cobrança — que já persegue vencido — não
// saberia o que cobrar.
//
// Com uma linha por parcela, tudo que já existe passa a funcionar de graça: o
// contas a receber, o aviso de vencido, o relatório e a baixa individual.
//
// ─── O prazo é em DIAS, e não em meses ───────────────────────────────────────
//
// `dividirEmParcelas` (lib/compras-dinheiro.ts) existe e divide de mês em mês —
// é o certo para a compra parcelada do fornecedor. Aqui não serve: prestador de
// serviço combina 7, 15 e 30 DIAS depois da execução, e "um mês" não é 30 dias.
//
// Módulo puro: cada centavo aqui vira boleto na mão de um cliente.

/** Os prazos que aparecem prontos na tela. Qualquer número é aceito. */
export const PRAZOS_USUAIS = [7, 15, 30] as const

export const MAX_PARCELAS = 24

export type Parcela = {
  /** 0 é a entrada; 1 em diante são as parcelas do saldo. */
  numero: number
  valor: number
  vencimento: Date
  entrada: boolean
}

export type ProblemaDoPlano =
  | "totalInvalido"
  | "entradaMaiorQueTotal"
  | "entradaNegativa"
  | "parcelasInvalidas"
  | "prazoInvalido"
  /** Entrada cobre tudo: não sobra saldo para parcelar. */
  | "semSaldoAParcelar"

export type EntradaDoPlano = {
  /** O valor total do serviço, em reais. */
  total: number
  /** Quanto o cliente paga à vista. Zero quando não há entrada. */
  entrada: number
  /** Em quantas vezes o SALDO é dividido. */
  parcelas: number
  /** Dias entre uma parcela e a seguinte, contados da execução. */
  prazoDias: number
}

/**
 * O plano serve? `null` quando sim.
 *
 * Entrada igual ao total é recusada com erro próprio, e não tratada como
 * "pagamento à vista": quem preencheu um plano de parcelamento quis parcelar, e
 * devolver silenciosamente uma parcela só esconderia o engano de digitação.
 */
export function problemaNoPlano(e: EntradaDoPlano): ProblemaDoPlano | null {
  if (!Number.isFinite(e.total) || e.total <= 0) return "totalInvalido"
  if (!Number.isFinite(e.entrada) || e.entrada < 0) return "entradaNegativa"
  if (e.entrada > e.total) return "entradaMaiorQueTotal"
  if (e.entrada === e.total) return "semSaldoAParcelar"
  if (!Number.isFinite(e.parcelas) || e.parcelas < 1 || e.parcelas > MAX_PARCELAS) {
    return "parcelasInvalidas"
  }
  if (!Number.isFinite(e.prazoDias) || e.prazoDias < 1 || e.prazoDias > 365) return "prazoInvalido"
  return null
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * As parcelas, a partir da data da execução.
 *
 * A entrada vence NA execução; a parcela 1 vence `prazoDias` depois, a 2 vence
 * `2 × prazoDias` depois, e assim por diante. É como "7 dias" é combinado de
 * verdade: contado do serviço, não do fim do mês.
 *
 * O centavo que sobra vai para a PRIMEIRA parcela do saldo, e não para a
 * última: a mesma convenção de `dividirEmParcelas`, e a que faz o cliente pagar
 * o quebrado logo em vez de estranhar no fim.
 *
 * Lança quando o plano não serve — quem chama precisa ter passado por
 * `problemaNoPlano` primeiro, e devolver uma lista vazia aqui faria a receita
 * sumir em silêncio.
 */
export function montarPlano(e: EntradaDoPlano, execucao: Date): Parcela[] {
  const problema = problemaNoPlano(e)
  if (problema) throw new Error(`plano inválido: ${problema}`)

  const totalCentavos = Math.round(e.total * 100)
  const entradaCentavos = Math.round(e.entrada * 100)
  const saldo = totalCentavos - entradaCentavos

  const lista: Parcela[] = []

  if (entradaCentavos > 0) {
    lista.push({
      numero: 0,
      valor: entradaCentavos / 100,
      vencimento: new Date(execucao),
      entrada: true,
    })
  }

  const n = Math.floor(e.parcelas)
  const base = Math.floor(saldo / n)
  const sobra = saldo - base * n

  for (let i = 0; i < n; i++) {
    lista.push({
      numero: i + 1,
      valor: (i === 0 ? base + sobra : base) / 100,
      vencimento: new Date(execucao.getTime() + e.prazoDias * (i + 1) * DIA_EM_MS),
      entrada: false,
    })
  }

  return lista
}

/**
 * A soma das parcelas, em reais.
 *
 * Existe para o TESTE poder afirmar que ela é igual ao total — a invariante que
 * este tipo de conta convida a quebrar, e a única que o cliente confere sozinho
 * somando os boletos.
 */
export function somaDoPlano(parcelas: readonly Parcela[]): number {
  return parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100
}

/**
 * Os rótulos das parcelas, na ordem: "entrada", "1/3", "2/3", "3/3".
 *
 * ─── Por que derivado da DATA, e não de um campo ────────────────────────────
 *
 * Com datas combinadas à mão não existe mais uma "entrada" declarada — existe
 * uma lista. Mas parcela que vence NO DIA DA EXECUÇÃO é a entrada, por
 * definição: é o que o cliente pagou na hora.
 *
 * Derivar em vez de guardar um sinalizador é o que mantém o rótulo verdadeiro
 * depois de a pessoa editar as datas. Um campo `entrada: true` gravado na
 * geração continuaria dizendo "entrada" numa linha que ela empurrou para dali a
 * trinta dias.
 *
 * As numeradas contam só entre elas: "entrada, 1/3, 2/3, 3/3" é como se fala, e
 * "entrada, 2/4" faria o cliente procurar a parcela 1.
 */
export function rotularParcelas(
  parcelas: readonly { vencimento: Date }[],
  execucao: Date
): string[] {
  const ehEntrada = (d: Date) => mesmoDia(d, execucao)
  const quantasNumeradas = parcelas.filter((p) => !ehEntrada(p.vencimento)).length

  let n = 0
  return parcelas.map((p) => {
    if (ehEntrada(p.vencimento)) return "entrada"
    n += 1
    return `${n}/${quantasNumeradas}`
  })
}

/** Mesmo dia no calendário de Brasília — a hora não entra na conta. */
function mesmoDia(a: Date, b: Date): boolean {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)
  return fmt(a) === fmt(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// O plano COMBINADO, linha a linha.
//
// `montarPlano` cobre o caso comum — entrada mais parcelas iguais espaçadas por
// um prazo — e é o que resolve 7, 15, 30, 60 e 90 em dois cliques.
//
// Mas "a empresa combina qualquer data para o pagamento": o cliente que paga
// R$ 800 no dia 15 e R$ 700 no dia 3 do mês seguinte não cabe em intervalo fixo
// com valores iguais. Então o gerador passa a ser um ATALHO, e o que vale de
// verdade é a lista — a pessoa gera e ajusta.
//
// Isso desloca a validação para cá: quem grava recebe uma lista pronta e
// precisa conferi-la inteira, porque ela vem da tela e a Action é endereço HTTP.

export type ProblemaDasParcelas =
  | "semParcelas"
  | "parcelasDemais"
  | "valorInvalido"
  | "somaNaoBate"
  | "dataInvalida"
  | "dataMuitoLonge"

/** Uma linha do plano, como a tela manda. */
export type ParcelaCombinada = {
  valor: number
  vencimento: Date
  /** Já foi recebida (o caso da entrada paga na hora). */
  recebida?: boolean
}

/** Nenhum vencimento além disto: é engano de digitação, não combinado. */
const MAX_DIAS_ADIANTE = 365 * 3

/**
 * A lista combinada serve? `null` quando sim.
 *
 * A checagem que importa é a SOMA: as parcelas têm de fechar com o valor do
 * serviço, ao centavo. Uma lista que soma menos deixaria dinheiro sem cobrar, e
 * uma que soma mais cobraria do cliente algo que ninguém combinou — e as duas
 * passariam despercebidas, porque cada linha isolada parece plausível.
 */
export function problemaNasParcelas(
  parcelas: readonly ParcelaCombinada[],
  total: number,
  execucao: Date
): ProblemaDasParcelas | null {
  if (!Number.isFinite(total) || total <= 0) return "valorInvalido"
  if (parcelas.length === 0) return "semParcelas"
  if (parcelas.length > MAX_PARCELAS) return "parcelasDemais"

  let soma = 0
  for (const p of parcelas) {
    if (!Number.isFinite(p.valor) || p.valor <= 0) return "valorInvalido"
    soma += Math.round(p.valor * 100)

    const t = p.vencimento?.getTime?.()
    if (t === undefined || !Number.isFinite(t)) return "dataInvalida"
    // Vencimento ANTES da execução é engano: não se combina pagar um serviço
    // antes de ele existir. Um dia de folga porque a execução tem hora e o
    // vencimento não.
    if (t < execucao.getTime() - DIA_EM_MS) return "dataInvalida"
    if (t > execucao.getTime() + MAX_DIAS_ADIANTE * DIA_EM_MS) return "dataMuitoLonge"
  }

  if (soma !== Math.round(total * 100)) return "somaNaoBate"
  return null
}

/** Quanto falta (ou sobra) para a lista fechar com o total. Para a tela mostrar. */
export function faltaParaFechar(parcelas: readonly ParcelaCombinada[], total: number): number {
  const soma = parcelas.reduce((s, p) => s + Math.round((Number(p.valor) || 0) * 100), 0)
  return (Math.round(total * 100) - soma) / 100
}
