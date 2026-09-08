// As regras do canal de dúvida.
//
// O cliente escreve dentro do sistema, o dono responde pelo painel, e a
// conversa fica gravada. Módulo puro: os limites e o ciclo de vida precisam ser
// testáveis sem banco.

import { codigoDaTelaAtual, DESTINOS } from "@/lib/codigos-abas"

export type StatusDaDuvida = "ABERTA" | "RESPONDIDA" | "FECHADA"
export type QuemFalou = "CLIENTE" | "PLATAFORMA"

/**
 * Três conversas abertas por empresa.
 *
 * Não é para economizar linha no banco — é para o painel continuar legível. A
 * fila do dono é uma pessoa só olhando; uma empresa que abre quinze dúvidas
 * numa tarde afoga as das outras quatro, e a que mais precisa de resposta some
 * no meio. Três é o bastante para separar assuntos diferentes e pouco o
 * bastante para obrigar a fechar o que já foi resolvido.
 *
 * Conversa FECHADA não conta: quem resolveu abre outra quando precisar.
 */
export const MAX_ABERTAS_POR_EMPRESA = 3

/** Duas mil letras. Acima disso não é dúvida, é relatório — e vai por e-mail. */
export const MAX_CARACTERES = 2000

/**
 * Cinquenta mensagens numa conversa.
 *
 * Assunto que passa disso não se resolve por texto assíncrono: virou telefone.
 * O limite existe para o sistema dizer isso em vez de deixar a conversa
 * arrastar para sempre.
 */
export const MAX_MENSAGENS = 50

/** O mínimo para ser uma pergunta. */
export const MIN_CARACTERES = 5

export type ProblemaNoTexto = "vazio" | "curto" | "longo" | null

/**
 * O que há de errado com o texto, ou nada.
 *
 * Devolve QUAL problema, e não um sim/não: "mensagem inválida" manda a pessoa
 * adivinhar se escreveu demais ou de menos.
 */
export function problemaNoTexto(texto: unknown): ProblemaNoTexto {
  const t = String(texto ?? "").trim()
  if (t.length === 0) return "vazio"
  if (t.length < MIN_CARACTERES) return "curto"
  if (t.length > MAX_CARACTERES) return "longo"
  return null
}

/**
 * A tela em que a pessoa estava, em forma CANÔNICA.
 *
 * ─── Por que não guardar o caminho cru ───────────────────────────────────────
 *
 * `/service-orders/ckx9f2...` carrega o id de uma OS de um cliente final. Ele
 * apareceria no painel do dono da plataforma — que não tem nada a ver com
 * aquela OS — e viraria texto livre vindo de um endereço HTTP dentro de um
 * campo do banco. Duas coisas ruins pelo preço de uma.
 *
 * Guardar a rota do catálogo resolve as duas: `/service-orders` e o código
 * "1.1". O dono lê "ela estava em Ordens de Serviço", que é a informação que
 * responde metade da pergunta antes de ele abrir.
 *
 * Tela fora do catálogo devolve nulo — e nulo é honesto.
 */
export function telaCanonica(caminho: unknown): { rota: string; codigo: string } | null {
  const bruto = String(caminho ?? "")
  if (!bruto.startsWith("/")) return null

  const codigo = codigoDaTelaAtual(bruto)
  if (!codigo) return null

  const destino = DESTINOS.find((d) => d.codigo === codigo)
  return destino ? { rota: destino.rota, codigo } : null
}

/**
 * O status depois de alguém falar.
 *
 * O cliente falando REABRE a conversa fechada: ele voltou porque não resolveu,
 * e obrigá-lo a abrir outra perderia o contexto do que já foi dito — que é
 * justamente o que ele quer aproveitar ao responder ali.
 */
export function statusApos(quem: QuemFalou): StatusDaDuvida {
  return quem === "CLIENTE" ? "ABERTA" : "RESPONDIDA"
}

/**
 * Dá para escrever nesta conversa?
 *
 * FECHADA aceita, e é o que permite REABRIR: o cliente voltou porque não
 * resolveu, e obrigá-lo a abrir outra perderia o contexto do que já foi dito.
 *
 * CHEIA não aceita de ninguém — nem do dono. Um limite que vale só para um dos
 * lados não é limite, é obstáculo para o cliente.
 */
export function podeEscrever(mensagens: number): boolean {
  return mensagens < MAX_MENSAGENS
}

/** Pode abrir mais uma? */
export function podeAbrirNova(abertasAgora: number): boolean {
  return abertasAgora < MAX_ABERTAS_POR_EMPRESA
}

/**
 * A conversa está esperando o dono?
 *
 * É o que a fila do painel ordena por cima. RESPONDIDA está com o cliente;
 * FECHADA não está com ninguém.
 */
export function esperaResposta(status: StatusDaDuvida): boolean {
  return status === "ABERTA"
}

/**
 * O cliente tem resposta nova para ler?
 *
 * Compara a data da última mensagem com a da última leitura. Sem `readByClientAt`
 * e com o último a falar sendo a plataforma, é nova.
 */
export function temRespostaNova(
  ultimaMensagemEm: Date,
  ultimoAFalar: QuemFalou,
  lidaEm: Date | null
): boolean {
  if (ultimoAFalar !== "PLATAFORMA") return false
  return lidaEm === null || lidaEm < ultimaMensagemEm
}

/** Um resumo de uma linha da pergunta, para a lista e para o push. */
export function resumo(texto: string, limite = 90): string {
  const t = texto.trim().replace(/\s+/g, " ")
  return t.length <= limite ? t : `${t.slice(0, limite - 1)}…`
}
