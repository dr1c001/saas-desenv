// O catálogo do que o sistema notifica, e quem recebe cada coisa.
//
// ─── Sobre o SOM, porque é a primeira pergunta que aparece ───────────────────
//
// Não dá para escolher o toque pela web. A propriedade `sound` existiu num
// rascunho antigo da especificação de notificações e foi REMOVIDA — nenhum
// navegador implementa. No Android o som vem do canal de notificação, que
// pertence ao sistema operacional; no iPhone, do som padrão. Um site não toca
// arquivo próprio, e uma tela oferecendo "escolha seu toque" seria uma tela
// que não funciona.
//
// Quem troca o toque é a pessoa, nas configurações do aparelho.
//
// O que o sistema PODE controlar, e controla:
//   - silenciar (sem som nem vibração)
//   - escolher quais eventos recebe
//   - manter o urgente na tela até ser tocado (`requireInteraction`)
//   - substituir a notificação anterior do mesmo assunto em vez de empilhar

/** Quem recebe. */
export type Publico =
  /** A pessoa responsável pela OS. */
  | "responsavel"
  /** Dono e administradores da empresa — o escritório. */
  | "escritorio"

export type Evento =
  | "osAtribuida"
  | "osConcluida"
  | "osStatus"
  | "osDeContrato"
  | "orcamentoRespondido"
  | "pagamentoConfirmado"
  | "notaRejeitada"
  | "certificadoVencendo"

export type Definicao = {
  evento: Evento
  publico: Publico
  /** Fica na tela até ser tocada. Só para o que exige ação de alguém. */
  insistente?: boolean
}

export const EVENTOS: readonly Definicao[] = [
  // Para quem vai executar. Insistente: o técnico está em campo, com o celular
  // no bolso, e perder isto é perder o serviço do dia.
  { evento: "osAtribuida", publico: "responsavel", insistente: true },
  { evento: "osDeContrato", publico: "responsavel", insistente: true },

  // Para o escritório.
  { evento: "osConcluida", publico: "escritorio" },
  { evento: "osStatus", publico: "escritorio" },
  { evento: "orcamentoRespondido", publico: "escritorio", insistente: true },
  { evento: "pagamentoConfirmado", publico: "escritorio" },
  // Insistente: nota recusada significa OS faturada SEM documento fiscal. Some
  // da tela e ninguém descobre — que é exatamente o problema que ela resolve.
  { evento: "notaRejeitada", publico: "escritorio", insistente: true },
  // Insistente: certificado vencido para de emitir nota, e sem aviso ninguém
  // descobre até precisar faturar — que é sempre a pior hora.
  { evento: "certificadoVencendo", publico: "escritorio", insistente: true },
]

export function ehEvento(valor: string): valor is Evento {
  return EVENTOS.some((e) => e.evento === valor)
}

export function definicaoDe(evento: Evento): Definicao {
  return EVENTOS.find((e) => e.evento === evento)!
}

/**
 * A pessoa quer receber este aviso?
 *
 * O padrão é SIM — mesma regra das funções por empresa, e pelo mesmo motivo:
 * o banco guarda o que foi SILENCIADO. Lista vazia significa "recebe tudo",
 * que é o comportamento de hoje, e ninguém deixa de ser avisado no dia em que
 * a tela de preferências passa a existir.
 */
export function querReceber(evento: Evento, silenciados: readonly string[]): boolean {
  return !silenciados.includes(evento)
}

/** Só as chaves que o código conhece — o resto é ruído de edição antiga. */
export function silenciadosValidos(valores: readonly string[]): Evento[] {
  return [...new Set(valores.filter(ehEvento))]
}

/**
 * A etiqueta que agrupa notificações do mesmo assunto.
 *
 * Sem ela, dez mudanças de status da mesma OS viram dez notificações
 * empilhadas no celular do escritório. Com ela, a última substitui a anterior:
 * o que importa é o estado atual, não o histórico do que já passou.
 *
 * A OS atribuída fica de fora do agrupamento por OS de propósito — cada
 * atribuição é um serviço a fazer, e substituir uma pela outra esconderia
 * trabalho.
 */
export function etiqueta(evento: Evento, referencia: string): string | undefined {
  if (evento === "osStatus" || evento === "osConcluida") return `os:${referencia}`
  if (evento === "pagamentoConfirmado") return `pagamento:${referencia}`
  return undefined
}
