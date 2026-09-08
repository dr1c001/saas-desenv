// O teste grátis de 15 dias.
//
// ─── Ele existiu, foi removido, e voltou ─────────────────────────────────────
//
// Até 21/07/2026 havia trial. Ele foi tirado por decisão de produto — "chega de
// acesso grátis, o cadastro passa a não dar acesso nenhum" — e a limpeza levou
// junto o banner, os avisos do cron, o e-mail de expiração e os textos da
// landing.
//
// Voltou em 08/09/2026, com o produto focado num nicho só (prestadores de
// serviço). O que NÃO volta é o programa de indicação em "dias extras de
// trial": ele nunca chegou a ser aplicado de verdade, virou desconto percentual
// e o desconto funciona. Misturar os dois traria de volta um bônus que não
// existia.
//
// ─── Sem cartão ──────────────────────────────────────────────────────────────
//
// Quinze dias, sem pedir cartão. No fim do prazo o acesso simplesmente para e a
// pessoa cai na tela de assinatura — nada é cobrado, nada é cancelado. Pedir
// cartão para um teste é a forma mais rápida de não ter testes.
//
// Módulo puro: é a regra que decide quem entra no sistema.

/** Quantos dias dura o teste. */
export const DIAS_DE_TESTE = 15

/**
 * Quando o teste desta empresa termina.
 *
 * Meia-noite do dia seguinte ao último, e não "agora + 15 dias": quem se
 * cadastra às 23h de uma terça não pode perder um dia inteiro de teste por
 * causa da hora em que criou a conta.
 */
export function fimDoTeste(criadaEm: Date): Date {
  const fim = new Date(criadaEm)
  fim.setUTCDate(fim.getUTCDate() + DIAS_DE_TESTE)
  // Meia-noite de Brasília do dia seguinte ao último dia de teste.
  return new Date(
    Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate() + 1) + 3 * 60 * 60 * 1000
  )
}

/**
 * A empresa ainda está no teste?
 *
 * `trialEndsAt` nulo devolve FALSO, e não verdadeiro. É o estado das empresas
 * criadas enquanto não havia trial: dar acesso a elas agora seria reabrir de
 * graça o sistema para quem parou de pagar — o oposto do que o retorno do teste
 * quer fazer.
 */
export function testeAtivo(trialEndsAt: Date | null | undefined, agora: Date): boolean {
  if (!trialEndsAt) return false
  return agora.getTime() < new Date(trialEndsAt).getTime()
}

/**
 * Quantos dias inteiros faltam.
 *
 * Arredonda para CIMA: faltando 6 horas, a tela diz "1 dia", e não "0 dias".
 * Zero é o que se mostra a quem já perdeu o acesso, e quem ainda tem a tarde
 * inteira não está nessa situação.
 */
export function diasRestantes(trialEndsAt: Date | null | undefined, agora: Date): number {
  if (!trialEndsAt) return 0
  const ms = new Date(trialEndsAt).getTime() - agora.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/**
 * Os dias em que a pessoa é avisada de que o teste está acabando.
 *
 * Três avisos, e não um: quem recebe só no último dia não tem tempo de decidir,
 * conversar com sócio nem passar no cartão. E não mais que três, porque a
 * diferença entre lembrar e importunar é o número de vezes.
 */
export const AVISOS_DE_FIM = [7, 3, 1] as const

export type DecisaoDeAviso = {
  enviar: boolean
  /** Quantos avisos passaram a ter sido enviados. Quem chama grava. */
  total: number
  /** Quantos dias faltam, para o texto. */
  diasRestantes: number
}

/**
 * Avisar agora?
 *
 * Conta POSIÇÃO na escada, e não mensagens enviadas — mesma regra da régua de
 * cobrança, e pelo mesmo motivo: um aviso perdido (cron fora do ar) não pode
 * deslocar todos os seguintes, e rodar duas vezes no mesmo dia não pode mandar
 * dois e-mails.
 *
 * Quando vários marcos vencem de uma vez, manda UM — o mais recente. Receber
 * "faltam 7 dias" e "falta 1 dia" no mesmo minuto é pior que ter recebido só o
 * segundo.
 */
export function decidirAvisoDeFim(
  dias: number,
  jaEnviados: number
): DecisaoDeAviso {
  // Os marcos que o calendário já passou. AVISOS_DE_FIM é decrescente, então
  // "passou" é `dias <= marco`.
  const total = AVISOS_DE_FIM.filter((m) => dias <= m).length

  if (dias <= 0) return { enviar: false, total: jaEnviados, diasRestantes: 0 }
  if (total <= jaEnviados) return { enviar: false, total, diasRestantes: dias }
  return { enviar: true, total, diasRestantes: dias }
}
