// Estoque POR LOCAL.
//
// ─── O problema que isto resolve ─────────────────────────────────────────────
//
// Até aqui o saldo era um número só por peça. "Tem 4 no estoque" não responde
// a pergunta que o dono de uma empresa de campo realmente faz: *onde*. Porque
// a van de cada técnico é um almoxarifado que anda — a peça pode estar do
// outro lado da cidade, no carro do Carlos, e o sistema dizia que tinha.
//
// É a lacuna mais específica deste ramo. Sistema genérico de estoque costuma
// tratar o almoxarifado como um ponto só, o que serve a loja e não serve a
// quem trabalha na rua.
//
// ─── Por que o saldo total CONTINUA em Part.stock ────────────────────────────
//
// `Part.stock` já é lido pelo alerta de mínimo, pela listagem, pela escolha de
// peça na OS e pelos relatórios. Trocar tudo por uma soma de saldos por local
// seria refazer meia dúzia de telas para chegar no mesmo número.
//
// Então ele permanece como o TOTAL, e passa a existir um saldo por local ao
// lado. Os dois são escritos na mesma transação, e há teste garantindo que o
// total é sempre a soma das partes — que é exatamente o defeito que este tipo
// de desenho convida.
//
// Módulo puro: as regras precisam ser testáveis sem banco.

export type TipoDeLocal =
  /** Ponto fixo: o depósito da empresa. */
  | "ALMOXARIFADO"
  /** A van de um técnico. Anda, e é por isso que este recurso existe. */
  | "VEICULO"

export const TIPOS_DE_LOCAL: readonly TipoDeLocal[] = ["ALMOXARIFADO", "VEICULO"]

/**
 * O nome do local que toda empresa ganha ao migrar.
 *
 * A migração precisa pôr o saldo existente em ALGUM lugar, e esse lugar tem de
 * ter nome antes de o dono abrir a tela — senão ele encontra "sem local" e não
 * sabe se é defeito.
 */
export const LOCAL_PADRAO = "Almoxarifado"

export function tipoDeLocalValido(v: string): v is TipoDeLocal {
  return (TIPOS_DE_LOCAL as readonly string[]).includes(v)
}

export type Local = {
  id: string
  nome: string
  tipo: TipoDeLocal
  /** O técnico dono da van. Nulo no almoxarifado. */
  userId: string | null
  ativo: boolean
}

/**
 * Qual local usar quando quem chama não escolheu um.
 *
 * A ordem importa e não é arbitrária:
 *
 *   1. o VEÍCULO da pessoa que está movimentando — o técnico que gasta uma
 *      peça gasta a que está com ele, e obrigá-lo a escolher todo dia o mesmo
 *      local é a forma mais rápida de ele escolher errado com pressa;
 *   2. senão, o primeiro almoxarifado;
 *   3. senão, qualquer local ativo.
 *
 * `null` quando não há local nenhum — situação que só existe se alguém apagar
 * todos, e quem chama precisa tratar em vez de gravar num lugar inventado.
 */
export function localPadrao(locais: readonly Local[], userId: string | null): Local | null {
  const ativos = locais.filter((l) => l.ativo)
  if (ativos.length === 0) return null

  if (userId) {
    const meuVeiculo = ativos.find((l) => l.tipo === "VEICULO" && l.userId === userId)
    if (meuVeiculo) return meuVeiculo
  }
  return ativos.find((l) => l.tipo === "ALMOXARIFADO") ?? ativos[0]
}

export type ProblemaDeTransferencia =
  | "mesmoLocal"
  | "quantidadeInvalida"
  | "saldoInsuficiente"
  | "localInativo"

/**
 * Uma transferência serve? `null` quando sim.
 *
 * Transferência não é entrada nem saída: é as duas, ligadas. O total da
 * empresa não muda — só a localização. Por isso ela tem regra própria, e a
 * principal é que a origem precisa TER o que está saindo.
 *
 * Saldo negativo é permitido no movimento avulso (a realidade chega ao sistema
 * atrasada, e travar a baixa da OS por causa disso pararia o trabalho). Mas
 * numa transferência não: mover o que não está lá não é registro atrasado, é
 * engano — e criaria saldo do nada no destino.
 */
export function problemaNaTransferencia(entrada: {
  origem: Local | null
  destino: Local | null
  quantidade: number
  saldoNaOrigem: number
}): ProblemaDeTransferencia | null {
  const { origem, destino, quantidade, saldoNaOrigem } = entrada

  if (!origem || !destino) return "localInativo"
  if (!origem.ativo || !destino.ativo) return "localInativo"
  if (origem.id === destino.id) return "mesmoLocal"
  if (!Number.isFinite(quantidade) || quantidade <= 0) return "quantidadeInvalida"
  if (quantidade > saldoNaOrigem) return "saldoInsuficiente"
  return null
}

/**
 * Dá para desativar este local?
 *
 * Não, enquanto houver peça nele — o saldo sumiria da vista sem ter saído de
 * lugar nenhum, e o total da empresa passaria a contar algo que ninguém
 * consegue mais encontrar na tela. Esvaziar primeiro (transferindo) é o gesto
 * certo, e é o que a mensagem manda fazer.
 */
export function podeDesativarLocal(saldos: readonly { quantidade: number }[]): boolean {
  return saldos.every((s) => s.quantidade === 0)
}

/**
 * O total da peça, a partir dos saldos por local.
 *
 * Existe para o TESTE poder afirmar que `Part.stock` é a soma — a única
 * garantia contra os dois números divergirem em silêncio, que é o defeito
 * clássico de manter total e parcelas ao mesmo tempo.
 */
export function totalDosLocais(saldos: readonly { quantidade: number }[]): number {
  // Arredonda na terceira casa: a coluna é Decimal(12,3), e somar float puro
  // acumula resto binário que faz o total diferir da soma por 0,0000001.
  return Math.round(saldos.reduce((t, s) => t + s.quantidade, 0) * 1000) / 1000
}

/** O rótulo do local na tela: "Van do Carlos" precisa de quem é a van. */
export function nomeCompleto(local: Local, nomeDaPessoa?: string | null): string {
  if (local.tipo === "VEICULO" && nomeDaPessoa) return `${local.nome} — ${nomeDaPessoa}`
  return local.nome
}
