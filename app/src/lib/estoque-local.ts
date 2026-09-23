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
  /** Onde a compra CHEGA e ainda não foi conferida. */
  | "RECEBIMENTO"
  /** O chão de fábrica: material já separado para ser consumido. */
  | "PRODUCAO"
  /** O que está separado para SAIR — carga de van, entrega, retirada. */
  | "EXPEDICAO"
  /** A van de um técnico. Anda, e é por isso que este recurso existe. */
  | "VEICULO"

/**
 * A ordem aqui é a ordem do `<select>`, e não é alfabética.
 *
 * ALMOXARIFADO primeiro porque é o padrão e o caso comum. Depois os três
 * setores na ordem do caminho físico da peça — chega, é usada, sai — para quem
 * está criando um local reconhecer o próprio galpão na lista em vez de ler
 * cinco palavras soltas. VEICULO por último: é o único que anda, e por isso o
 * mais fácil de identificar mesmo no fim.
 *
 * ATENÇÃO: cada valor daqui existe também no enum do Postgres, e Postgres NÃO
 * remove valor de enum. Acrescentar é decisão sem volta — foi por isso que
 * entraram exatamente os três setores pedidos, e não uma lista "completa"
 * inventada por antecipação.
 */
export const TIPOS_DE_LOCAL: readonly TipoDeLocal[] = [
  "ALMOXARIFADO",
  "RECEBIMENTO",
  "PRODUCAO",
  "EXPEDICAO",
  "VEICULO",
]

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

/**
 * A posição do tipo na ordem de exibição.
 *
 * Existe porque o banco NÃO serve para isso: o Postgres ordena enum pela ordem
 * de declaração, e os setores novos foram declarados depois de VEICULO — não dá
 * para inserir valor no meio de um enum. Ordenar no banco jogaria a van entre o
 * almoxarifado e o recebimento, e as duas listas da mesma tela (o cartão de
 * locais e o `<select>`) discordariam entre si.
 */
export function ordemDoTipo(tipo: string): number {
  const i = (TIPOS_DE_LOCAL as readonly string[]).indexOf(tipo)
  // Tipo desconhecido vai para o fim em vez de para o começo: se um dia um
  // valor novo chegar do banco antes de existir aqui, ele aparece no lugar
  // menos danoso — no fim, e não empurrando o almoxarifado para baixo.
  return i === -1 ? TIPOS_DE_LOCAL.length : i
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

/** Motivo de transferência é campo curto: é uma linha de histórico, não um laudo. */
export const MAX_MOTIVO = 200

/**
 * O texto que vai para o histórico das duas pernas da transferência.
 *
 * Antes, a linha dizia só "Transferência para Expedição". Isso responde PARA
 * ONDE e nunca responde POR QUÊ — e "por que transferiu" é metade do que se
 * pergunta três meses depois, quando alguém quer saber por que havia 40 peças
 * paradas na expedição.
 *
 * O destino continua no texto, e o motivo entra depois dele. Um só campo, e
 * não dois: o histórico já lê `reason` numa linha, e as linhas antigas
 * continuam querendo dizer exatamente o que sempre disseram.
 *
 * Motivo é opcional de propósito. Exigir justificativa em toda transferência
 * treina a pessoa a digitar "x" para o formulário deixar passar — e aí o campo
 * passa a mentir, que é pior do que estar vazio.
 */
export function motivoDaTransferencia(
  motivo: string,
  outroLado: string,
  sentido: "saida" | "entrada"
): string {
  const base = sentido === "saida" ? `Transferência para ${outroLado}` : `Transferência de ${outroLado}`
  const limpo = motivo.trim().slice(0, MAX_MOTIVO)
  return limpo ? `${base} — ${limpo}` : base
}

/**
 * Os locais que podem aparecer numa transferência desta peça.
 *
 * A regra que isto conserta: até aqui a tela mostrava só os locais que JÁ
 * tinham saldo da peça. Quem criava o setor "Expedição" nunca conseguia pôr
 * nada dentro dele — o destino não existia na lista até já ter o que receber,
 * e a única forma de ganhar saldo era receber uma transferência. O recurso de
 * setores inteiro morria nesse laço.
 *
 * Então: todo local ATIVO entra, com zero quando não há linha de saldo. E o
 * local inativo entra apenas se ainda tiver peça — é justamente ele que
 * precisa ser esvaziado, e escondê-lo prenderia o saldo lá dentro.
 */
export function saldosParaTransferir(
  locais: readonly Local[],
  saldos: readonly { locationId: string; quantidade: number }[]
): { local: Local; quantidade: number }[] {
  const porLocal = new Map(saldos.map((s) => [s.locationId, s.quantidade]))
  return locais
    .map((local) => ({ local, quantidade: porLocal.get(local.id) ?? 0 }))
    .filter(({ local, quantidade }) => local.ativo || quantidade !== 0)
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
