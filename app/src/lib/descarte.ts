// Quando uma empresa pode ser APAGADA do sistema.
//
// O caso: cadastro que nunca virou nada. Alguem cria a conta, nao assina, nao
// cadastra ninguem, e o registro fica no painel para sempre — atrapalhando a
// leitura de quantos clientes de verdade existem.
//
// ─── Por que isto e um modulo puro, com teste, e nao um `delete` na action ───
//
// Apagar empresa e a operacao mais destrutiva que existe neste sistema: leva
// junto usuarios, clientes, ordens de servico, receitas e notas fiscais
// emitidas. Nao ha desfazer, nao ha lixeira, e o dado e de TERCEIROS — os
// clientes finais da empresa apagada.
//
// A regra de quem pode ser apagado precisa ser lida, discutida e testada
// separada de qualquer tela. Uma condicao errada aqui nao da erro: apaga.
//
// ─── A protecao que o banco ja da ────────────────────────────────────────────
//
// Dezessete tabelas apontam para Tenant com RESTRICT (e nao CASCADE): o
// Postgres RECUSA apagar uma empresa que tenha cliente, OS, receita, usuario.
// Isso e uma rede de seguranca de verdade, e este modulo trabalha COM ela em
// vez de contorna-la — nada aqui apaga filho para depois apagar o pai.
//
// Consequencia pratica: so da para apagar o que esta praticamente vazio, que e
// exatamente o caso que motivou a funcionalidade.

/** O retrato que a decisao precisa. Numeros, e nao registros: a pergunta e
 *  "tem alguma coisa aqui dentro?", nao "o que tem". */
export type RetratoDaEmpresa = {
  id: string
  nome: string
  /** TRIAL, PENDING, ACTIVE, PAST_DUE ou CANCELLED. */
  situacao: string
  /** Ja teve alguma assinatura registrada, mesmo que cancelada depois? */
  jaAssinou: boolean
  criadaEm: Date
  usuarios: number
  clientes: number
  ordens: number
  receitas: number
  orcamentos: number
}

export type MotivoParaNaoApagar =
  /** Tem assinatura viva. Nunca, em hipotese nenhuma. */
  | "assinaturaViva"
  /** Ja pagou em algum momento — o historico dela tem valor contabil. */
  | "jaFoiCliente"
  /** Tem trabalho registrado dentro. */
  | "temDados"
  /** Cadastro recente: pode ser alguem no meio do processo agora. */
  | "recenteDemais"

/** Situacoes em que a empresa esta usando ou pagando o sistema. */
const VIVAS = ["ACTIVE", "PAST_DUE", "PENDING"]

/**
 * Quantos dias um cadastro precisa ter para ser considerado abandonado.
 *
 * Sete, e nao um: alguem que cria a conta na sexta e volta na segunda para
 * assinar nao pode encontrar a empresa apagada. O custo de esperar uma semana
 * e uma linha a mais na lista; o custo de apagar cedo demais e um cliente
 * perdido que nem descobre por que.
 */
export const DIAS_PARA_ABANDONO = 7

/**
 * Esta empresa pode ser apagada?
 *
 * `null` = pode. Devolve o MOTIVO em vez de um booleano porque a tela precisa
 * explicar por que aquele botao esta desligado — "nao pode" sem motivo faz
 * quem administra achar que e defeito e procurar outro caminho.
 *
 * A ordem importa: assinatura viva vem primeiro porque e a razao mais grave, e
 * e a que nao muda com o tempo nem com limpeza de dados.
 */
export function porQueNaoApagar(
  e: RetratoDaEmpresa,
  agora: Date = new Date()
): MotivoParaNaoApagar | null {
  if (VIVAS.includes(e.situacao)) return "assinaturaViva"

  // Ja pagou algum dia: o registro dela tem valor contabil e fiscal, mesmo
  // cancelada. Cancelar assinatura nao e o mesmo que nunca ter sido cliente.
  if (e.jaAssinou) return "jaFoiCliente"

  // Qualquer trabalho registrado dentro. O banco recusaria de todo jeito
  // (RESTRICT), mas dizer isto ANTES e melhor que oferecer um botao que
  // estoura um erro de chave estrangeira na cara de quem clicou.
  if (e.clientes > 0 || e.ordens > 0 || e.receitas > 0 || e.orcamentos > 0) return "temDados"

  const dias = (agora.getTime() - e.criadaEm.getTime()) / 86_400_000
  if (dias < DIAS_PARA_ABANDONO) return "recenteDemais"

  return null
}

/** Atalho para a tela. */
export function podeApagar(e: RetratoDaEmpresa, agora?: Date): boolean {
  return porQueNaoApagar(e, agora) === null
}

/**
 * O que sera apagado junto, para a confirmacao mostrar.
 *
 * Uma empresa que passa na regra tem no maximo usuarios — os demais numeros
 * sao zero por definicao. Mostrar o numero mesmo assim nao e redundante: e o
 * que permite a quem confirma perceber que esta olhando a empresa errada.
 */
export function oQueVaiJunto(e: RetratoDaEmpresa): string[] {
  const partes: string[] = []
  if (e.usuarios > 0) partes.push(`${e.usuarios} usuário${e.usuarios > 1 ? "s" : ""}`)
  return partes
}
