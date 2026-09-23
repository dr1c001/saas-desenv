// Quando quem contrata nao e quem recebe o servico.
//
// O caso: uma administradora de condominios fecha contrato com a empresa, mas
// o servico e feito em cada condominio. Vale igual para seguradora e segurado,
// rede de franquias e cada loja, construtora e cada obra.
//
// ─── As duas perguntas, que sao diferentes ───────────────────────────────────
//
//   ONDE o servico acontece?  → ServiceOrder.clientId (o condominio)
//   QUEM paga por ele?        → ServiceOrder.payerId, com padrao no contratante
//
// Ate aqui o sistema respondia as duas com o mesmo campo, porque eram sempre a
// mesma pessoa. Separa-las e o que permite a nota fiscal sair no CNPJ certo.
//
// ─── Por que isto e delicado, e nao so um campo novo ─────────────────────────
//
// TUDO que envolve dinheiro seguia ServiceOrder.clientId: a receita nasce dele,
// o ranking de clientes soma por ele, e — o grave — `emitNfse` o usa como
// TOMADOR da nota. Apontar a OS para o condominio sem mexer nesses tres pontos
// faria a nota sair contra o CNPJ do condominio, quando o contrato e o
// pagamento sao com a administradora. Erro fiscal, no nome da empresa do
// cliente, perante a prefeitura.
//
// ─── Um nivel so ─────────────────────────────────────────────────────────────
//
// Subcliente nao pode ter subcliente. Administradora → Condominio, e para.
//
// Isso elimina de vez o risco de ciclo — A pai de B, B pai de A, e a busca de
// quem paga entra em laco infinito — sem precisar de deteccao de ciclo em toda
// gravacao. Se um dia aparecer necessidade real de tres niveis, a conversa
// acontece com o caso na mao, e nao por precaucao.

/** O minimo que se precisa saber de um cliente para responder quem paga. */
export type ClienteVinculo = {
  id: string
  /** O contratante, quando este cliente e subcliente de alguem. */
  parentId: string | null
}

export type RecusaDeVinculo =
  /** Ninguem e contratante de si mesmo. */
  | "sequeEleMesmo"
  /** Um nivel so: o contratante escolhido ja e subcliente de outro. */
  | "contratanteJaEhSubcliente"
  /** Este cliente ja tem subclientes, entao nao pode virar subcliente. */
  | "jaEhContratante"

/**
 * Este cliente pode ter aquele como contratante?
 *
 * Devolve o MOTIVO, e nao um booleano: a tela precisa dizer o que fazer
 * diferente. "Vinculo invalido" nao explica nada a quem esta tentando
 * organizar a carteira.
 */
export function podeSerContratante(
  cliente: ClienteVinculo & { temSubclientes: boolean },
  contratante: ClienteVinculo
): RecusaDeVinculo | null {
  if (cliente.id === contratante.id) return "sequeEleMesmo"
  if (contratante.parentId !== null) return "contratanteJaEhSubcliente"
  if (cliente.temSubclientes) return "jaEhContratante"
  return null
}

/**
 * Quem paga por esta ordem de servico.
 *
 * `escolhido` e a decisao tomada NAQUELA OS: normalmente vazio, e ai o padrao
 * vale. Existe porque a administradora paga quase tudo, mas as vezes o
 * condominio paga direto um servico extra — e forcar tudo para o contratante
 * faria a empresa emitir nota errada justamente no caso excepcional, que e
 * quando alguem repara.
 *
 * Valor invalido cai no padrao em vez de estourar: a OS ja existe, o servico ja
 * foi feito, e travar o faturamento por causa de um id que nao confere seria
 * pior que cobrar de quem o cadastro diz que deve pagar.
 */
export function quemPaga(cliente: ClienteVinculo, escolhido?: string | null): string {
  const padrao = cliente.parentId ?? cliente.id
  if (!escolhido) return padrao
  return pagadorValido(cliente, escolhido) ? escolhido : padrao
}

/**
 * O pagador escolhido serve?
 *
 * So o proprio cliente ou o contratante dele. Aceitar um id qualquer deixaria
 * a tela — ou uma chamada direta a Server Action, que e endereco HTTP — emitir
 * nota no CNPJ de um terceiro sem relacao nenhuma com o servico.
 */
export function pagadorValido(cliente: ClienteVinculo, escolhido: string): boolean {
  return escolhido === cliente.id || escolhido === cliente.parentId
}

/** Quem se pode escolher como pagador desta OS, na ordem em que a tela mostra. */
export function pagadoresPossiveis(cliente: ClienteVinculo): string[] {
  return cliente.parentId ? [cliente.parentId, cliente.id] : [cliente.id]
}

/** Este cliente e subcliente de alguem? */
export function ehSubcliente(cliente: ClienteVinculo): boolean {
  return cliente.parentId !== null
}

/**
 * Agrupa valores POR PAGADOR.
 *
 * Usado no ranking de clientes e em qualquer soma de dinheiro. Somar por
 * cliente da OS espalharia o faturamento da administradora entre trinta
 * condominios, e nenhum deles apareceria no Top 10 — enquanto o cliente que
 * mais fatura sumiria do relatorio inteiro.
 */
export function somarPorPagador<T>(
  itens: readonly T[],
  pagadorDe: (item: T) => string,
  valorDe: (item: T) => number
): Map<string, number> {
  const soma = new Map<string, number>()
  for (const i of itens) {
    const p = pagadorDe(i)
    soma.set(p, (soma.get(p) ?? 0) + valorDe(i))
  }
  return soma
}
