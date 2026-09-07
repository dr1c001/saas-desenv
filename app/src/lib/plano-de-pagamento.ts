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
 * O rótulo da parcela na descrição da receita.
 *
 * "Entrada" e "2/3" — e não "parcela 2". O cliente lê isto no extrato e no
 * boleto, e "2/3" diz quantas faltam sem obrigar ninguém a contar.
 */
export function rotuloDaParcela(p: Parcela, totalDeParcelas: number): string {
  if (p.entrada) return "entrada"
  return `${p.numero}/${totalDeParcelas}`
}
