// Fila de escrita offline.
//
// O técnico chega num subsolo, conclui o serviço e não tem sinal. Até aqui o
// app deixava ele LER a OS mas não fechar — e o trabalho ficava para "depois",
// que na prática vira nunca, ou vira um bilhete no bolso.
//
// Isto é diferente de guardar página em cache: aqui o técnico faz uma
// afirmação sobre o mundo real ("este serviço foi concluído, custou R$ 400") e
// o sistema promete registrar isso. Quebrar essa promessa é pior que ter
// recusado a operação de cara — ele foi embora achando que estava feito.
//
// Três problemas definem este módulo, e cada um tem uma resposta explícita:
//
// 1. IDEMPOTÊNCIA. A sincronização repete: rede oscila, o app reabre, o
//    usuário toca de novo. Concluir a OS duas vezes criaria duas receitas e
//    baixaria o estoque em dobro. Cada operação carrega um id gerado no
//    CLIENTE, e o servidor recusa o que já aplicou.
//
// 2. CONFLITO. A OS pode ter mudado enquanto o técnico estava sem sinal —
//    outra pessoa concluiu, faturou ou cancelou. A fila NÃO sobrescreve em
//    silêncio: o servidor recusa e o técnico é avisado com o motivo.
//
// 3. DESISTÊNCIA. Uma operação que falha para sempre não pode ficar tentando
//    para sempre, nem sumir sozinha. Depois de N tentativas ela para e fica
//    visível como pendência — a pessoa precisa saber que aquele trabalho não
//    chegou.
//
// Módulo puro: aqui mora a decisão do que fazer com cada resposta. Errar isso
// perde trabalho de campo, que é a coisa mais cara que este sistema guarda.

export type TipoOperacao = "CONCLUIR_OS" | "MUDAR_STATUS"

export type ItemDaConclusao = {
  description: string
  quantity: number
  unitPrice: number
  partId?: string | null
}

export type Operacao = {
  /** Gerado no cliente (crypto.randomUUID). É a chave da idempotência. */
  id: string
  tipo: TipoOperacao
  orderId: string
  /** Quando o técnico fez, não quando sincronizou. É o que vale no histórico. */
  criadaEm: number
  tentativas: number
  /** Motivo da última recusa, para a tela explicar. */
  ultimoErro?: string | null
  dados: {
    conclusionNote?: string
    items?: ItemDaConclusao[]
    invoiceImmediately?: boolean
    status?: string
  }
}

/**
 * Quantas vezes tentar antes de parar.
 *
 * Não é "desistir": a operação continua na fila, visível, marcada como travada.
 * Some só quando a pessoa resolver. Apagar sozinho seria perder o trabalho
 * silenciosamente, que é exatamente o que esta fila existe pra impedir.
 */
export const MAX_TENTATIVAS = 5

/** O veredito do servidor sobre uma operação. */
export type Veredito =
  | { estado: "aplicada" }
  /** Já tinha sido aplicada antes — a repetição é normal, não é erro. */
  | { estado: "repetida" }
  /** O servidor decidiu que não cabe (OS já concluída, faturada, sumiu). */
  | { estado: "recusada"; motivo: string }
  /** Falha de transporte: rede caiu, servidor fora. Vale tentar de novo. */
  | { estado: "falhou"; motivo: string }

export type Acao = "remover" | "manter" | "travar"

/**
 * O que fazer com a operação depois do veredito.
 *
 * "Aplicada" e "repetida" saem da fila do mesmo jeito: nos dois casos o
 * trabalho ESTÁ no servidor, que é a única coisa que interessa. Tratar
 * repetição como erro faria a fila nunca esvaziar depois de uma resposta
 * perdida no caminho.
 *
 * "Recusada" também sai — mas o motivo precisa ser mostrado. Insistir numa
 * operação que o servidor recusa por regra de negócio é gastar bateria pra
 * receber o mesmo não.
 */
export function decidir(v: Veredito, tentativas: number): Acao {
  if (v.estado === "aplicada" || v.estado === "repetida") return "remover"
  if (v.estado === "recusada") return "travar"
  return tentativas + 1 >= MAX_TENTATIVAS ? "travar" : "manter"
}

/** A operação parou de tentar e precisa de gente. */
export function estaTravada(op: Operacao): boolean {
  return op.tentativas >= MAX_TENTATIVAS
}

/**
 * A ordem de envio.
 *
 * Mais antiga primeiro, sempre. Se o técnico marcou "em andamento" e depois
 * concluiu, mandar na ordem inversa faria a OS terminar "em andamento" — o
 * último a chegar é que vale no servidor.
 *
 * Empate por id pra a ordem ser estável: duas operações no mesmo milissegundo
 * acontecem quando a tela dispara duas coisas juntas.
 */
export function ordenar(ops: Operacao[]): Operacao[] {
  return [...ops].sort((a, b) => a.criadaEm - b.criadaEm || a.id.localeCompare(b.id))
}

/**
 * Só o que vale a pena mandar agora.
 *
 * Travada fica de fora: já esgotou as tentativas e continua na fila só pra
 * pessoa ver.
 */
export function paraEnviar(ops: Operacao[]): Operacao[] {
  return ordenar(ops.filter((o) => !estaTravada(o)))
}

export type Resumo = {
  pendentes: number
  travadas: number
  total: number
}

export function resumir(ops: Operacao[]): Resumo {
  const travadas = ops.filter(estaTravada).length
  return { pendentes: ops.length - travadas, travadas, total: ops.length }
}

/**
 * Uma operação nova.
 *
 * `criadaEm` é o momento do técnico, e viaja com a operação: a OS precisa
 * registrar quando o serviço foi concluído no mundo real, não quando o celular
 * reencontrou sinal — que pode ser horas ou dias depois.
 */
export function novaOperacao(
  tipo: TipoOperacao,
  orderId: string,
  dados: Operacao["dados"],
  id: string,
  agora: number
): Operacao {
  return { id, tipo, orderId, dados, criadaEm: agora, tentativas: 0, ultimoErro: null }
}
