// O que se manda para o modelo, e o que se faz com a resposta.
//
// Módulo puro: nada aqui fala com a rede. É o que permite testar as decisões
// que mais importam — qual ferramenta foi pedida, se ela precisa de
// confirmação, o que a pessoa vai ler antes de confirmar — sem chamar a API e
// sem gastar dinheiro a cada teste.

import type { Vocabulario } from "@/lib/vocabulario"
import { ferramentaChamada, precisaConfirmar, type Ferramenta } from "@/lib/ia/ferramentas"

/**
 * O modelo.
 *
 * Sonnet, e não o mais barato: quem fala com a assistente está com as mãos
 * ocupadas e não vai reler o que ela entendeu. Errar o cliente ou a data numa
 * OS custa mais caro que a diferença de preço entre os modelos.
 *
 * Se o custo por uso apertar, este é o primeiro lugar a mexer — e o teste de
 * verdade é ouvir a assistente errando menos, não a fatura.
 */
export const MODELO = "claude-sonnet-5"

/** Teto de tokens por resposta. Resposta de assistente de voz é curta por
 *  natureza; um teto baixo também limita o estrago de um laço inesperado. */
export const MAX_TOKENS = 1024

/**
 * Quantas idas e voltas ao modelo numa mesma pergunta.
 *
 * "Quantas OS o João tem?" gasta duas: buscar o cliente, listar as OS. Seis dá
 * folga para encadear algumas leituras e ainda assim impede que uma ferramenta
 * devolvendo algo inesperado deixe o modelo girando e a conta subindo.
 */
export const MAX_VOLTAS = 6

export type FerramentaDaApi = {
  name: string
  description: string
  input_schema: Ferramenta["parametros"]
}

/** Traduz o catálogo para o formato que a API de ferramentas espera. */
export function comoFerramentasDaApi(fs: readonly Ferramenta[]): FerramentaDaApi[] {
  return fs.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.parametros,
  }))
}

export type Contexto = {
  /** Como a pessoa se chama. A assistente fala com ela, não com "o usuário". */
  nome: string
  /** OWNER, ADMIN ou TECHNICIAN. */
  papel: string
  /** Hoje, em AAAA-MM-DD, no fuso de Brasília. Sem isto o modelo não resolve
   *  "amanhã" nem "semana que vem" — e chutar data em agendamento é erro que
   *  só aparece quando o cliente reclama que ninguém foi. */
  hoje: string
  /** O nome que ESTA empresa dá às coisas. Uma empresa que chama de "chamado"
   *  não deve ouvir a assistente dizer "ordem de serviço". */
  vocabulario: Vocabulario
  /** A tela em que a pessoa está, quando há. Serve para resolver "conclui
   *  essa aqui" sem obrigar a ditar o número. */
  telaAtual?: string
}

/** As instruções da assistente. */
export function instrucoes(c: Contexto): string {
  const os = c.vocabulario.os
  const tec = c.vocabulario.tec
  return [
    `Você é a assistente do ServiçoOS, um sistema de gestão para empresas de serviço.`,
    `Está falando com ${c.nome}, que tem o papel de ${c.papel} na empresa.`,
    `Hoje é ${c.hoje}.`,
    c.telaAtual ? `A pessoa está agora na tela: ${c.telaAtual}.` : "",
    ``,
    `COMO ESTA EMPRESA CHAMA AS COISAS`,
    `Use estas palavras, e não outras:`,
    `- o trabalho que se abre para cada serviço: "${os.singular}" (plural "${os.plural}", forma curta "${os.curto}", gênero ${os.genero === "f" ? "feminino" : "masculino"})`,
    `- quem executa: "${tec.singular}" (plural "${tec.plural}")`,
    ``,
    `COMO FALAR`,
    `Português do Brasil. Frases curtas. Quem está falando com você quase sempre`,
    `está com as mãos ocupadas, no meio de um serviço, e vai OUVIR a resposta em`,
    `vez de ler. Vá direto ao ponto: sem saudação, sem "claro!", sem repetir a`,
    `pergunta antes de responder.`,
    ``,
    `O QUE NUNCA FAZER`,
    `- Nunca invente dado. Se precisa de um número, de um saldo ou de um`,
    `  histórico, use uma ferramenta. Não há nada pior aqui do que um valor`,
    `  plausível e errado.`,
    `- Nunca diga que fez algo que você não fez. Se uma ferramenta falhou, diga`,
    `  o que falhou.`,
    `- Nunca adivinhe QUAL registro. Se a pessoa disse "conclui a do João" e há`,
    `  dois Joões, ou duas ${os.plural} do mesmo João, PERGUNTE qual. Reconhecimento`,
    `  de fala erra, e agir na dúvida estraga o registro errado.`,
    `- Nunca peça, aceite ou repita senha, chave de API ou senha de certificado.`,
    ``,
    `SOBRE AS CONFIRMAÇÕES`,
    `Algumas ferramentas param para a pessoa confirmar antes de acontecer. Isso`,
    `é esperado e não é erro. Quando acontecer, não repita o pedido nem tente`,
    `outro caminho para contornar: apenas espere a resposta dela.`,
  ]
    .filter((l) => l !== "")
    .join("\n")
}

/** O que a assistente decidiu fazer com uma resposta do modelo. */
export type Decisao =
  /** Não pediu ferramenta nenhuma: é só uma resposta em texto. */
  | { tipo: "responder"; texto: string }
  /** Pediu algo que dá para executar direto. */
  | { tipo: "executar"; ferramenta: Ferramenta; id: string; args: Record<string, unknown> }
  /** Pediu algo que uma pessoa precisa ver antes. */
  | { tipo: "confirmar"; ferramenta: Ferramenta; id: string; args: Record<string, unknown> }
  /** Pediu uma ferramenta que esta pessoa não tem. */
  | { tipo: "negada"; id: string; nome: string }

/** Um bloco de resposta do modelo, no formato da API. */
export type BlocoDaResposta =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [k: string]: unknown }

/**
 * Lê a resposta do modelo e decide o que acontece.
 *
 * `disponiveis` é a lista que ESTA pessoa pode usar. Um modelo pode chamar uma
 * ferramenta que não está na lista dele — por confusão, ou porque alguém
 * adulterou o histórico que o navegador devolveu. Aqui isso vira "negada", e
 * não uma execução: a lista de quem pode o quê é conferida deste lado.
 */
export function decidir(
  blocos: readonly BlocoDaResposta[],
  disponiveis: readonly Ferramenta[]
): Decisao {
  const chamada = blocos.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | undefined

  if (!chamada) {
    const texto = blocos
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
    return { tipo: "responder", texto }
  }

  const permitida = disponiveis.find((f) => f.nome === chamada.name)
  if (!permitida) return { tipo: "negada", id: chamada.id, nome: chamada.name }

  // Confere no catálogo completo, e não no objeto que veio na lista: é de lá
  // que sai a classificação de risco.
  const f = ferramentaChamada(chamada.name)!
  const args = (chamada.input ?? {}) as Record<string, unknown>

  return precisaConfirmar(f)
    ? { tipo: "confirmar", ferramenta: f, id: chamada.id, args }
    : { tipo: "executar", ferramenta: f, id: chamada.id, args }
}

/** O resultado de uma ferramenta, no formato que volta para o modelo. */
export function comoResultado(id: string, conteudo: string, erro = false) {
  return {
    type: "tool_result" as const,
    tool_use_id: id,
    content: conteudo,
    ...(erro ? { is_error: true } : {}),
  }
}
