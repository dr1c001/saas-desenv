import { precoCheio, type Ciclo } from "@/lib/preco"

/**
 * Trocar de plano pelo painel.
 *
 * ─── O que havia antes ───────────────────────────────────────────────────────
 *
 * O manual prometia a troca no verbete 3.5. A Action recusava qualquer
 * assinatura nova enquanto existisse uma em andamento — com o comentário
 * dizendo, em voz alta, "troca de plano não é suportada ainda, precisa
 * cancelar antes". E a tela mostrava o botão *Assinar* em todos os planos que
 * não fossem o atual: o cliente clicava e recebia erro.
 *
 * Pior: o caminho que o erro mandava tomar era destrutivo. Cancelar e
 * reassinar grava `subscriptionStatus: "PENDING"` no tenant, e PENDING cai no
 * `return false` de `hasActiveSubscription` — a equipe inteira ia para
 * /expired e só voltava quando o pagamento novo fosse confirmado. O período já
 * pago era perdido nesse instante. (Achado na auditoria de 13/09/2026.)
 *
 * ─── As três regras, e por que cada uma ──────────────────────────────────────
 *
 * SUBIR vale na hora. O acesso ao plano novo é imediato e o preço novo entra
 * na próxima fatura; o período já pago não é recobrado nem creditado. A
 * empresa ganha o resto do ciclo no plano melhor. Não há conta de
 * proporcionalidade para errar, e o erro possível é a favor do cliente.
 *
 * DESCER é agendado para o fim do período pago. O contrato garante o que foi
 * pago, e tirar recurso no meio do ciclo tiraria algo já comprado. A próxima
 * fatura já sai pelo valor novo.
 *
 * TROCAR DE CICLO (mensal ↔ anual) fica de fora: `asaas.updateSubscription`
 * muda o `value`, não o `cycle`. Trocar o ciclo exigiria cancelar e recriar a
 * assinatura na Asaas — o mesmo caminho destrutivo que esta mudança veio
 * eliminar. A tela diz para falar com o suporte.
 *
 * Módulo PURO: isto decide DINHEIRO recorrente, e um erro aqui não dá erro em
 * lugar nenhum — sai na fatura do cliente.
 */

export type Direcao = "subir" | "descer" | "mesmo"

export type PlanoParaTroca = {
  id: string
  priceMonthly: number
  priceYearly: number
}

export type PedidoDeTroca = {
  atual: PlanoParaTroca
  novo: PlanoParaTroca
  ciclo: Ciclo
  /** A mensalidade combinada com esta empresa, quando existe. */
  combinado: number | null
}

export type RecusaDaTroca =
  | "mesmoPlano"
  /** Assinatura que não está ACTIVE: PENDING ainda não pagou, PAST_DUE deve a fatura. */
  | "assinaturaNaoAtiva"

export type DecisaoDaTroca =
  | { ok: false; motivo: RecusaDaTroca }
  | {
      ok: true
      direcao: Exclude<Direcao, "mesmo">
      /** O que a Asaas passa a cobrar por ciclo. */
      valorNovo: number
      /** Quando o plano novo passa a valer de verdade. */
      valeApartirDe: "agora" | "fimDoPeriodo"
    }

/** Para onde a troca vai, comparando o que se paga por ciclo. */
export function direcaoDaTroca(pedido: PedidoDeTroca): Direcao {
  const { ciclo, combinado } = pedido
  const de = precoCheio(pedido.atual, combinado, ciclo)
  const para = precoCheio(pedido.novo, combinado, ciclo)
  if (para > de) return "subir"
  if (para < de) return "descer"
  return "mesmo"
}

/**
 * Pode trocar? E o que acontece?
 *
 * `statusDaAssinatura` é exigido ACTIVE de propósito. PENDING ainda não pagou
 * nada — trocar ali é escolher outro plano antes do primeiro pagamento, e o
 * certo é cancelar e assinar o que se quer. PAST_DUE deve uma fatura: trocar
 * de plano com fatura aberta deixaria a cobrança velha e a nova convivendo.
 */
export function decidirTroca(
  pedido: PedidoDeTroca,
  statusDaAssinatura: string
): DecisaoDaTroca {
  if (statusDaAssinatura !== "ACTIVE") return { ok: false, motivo: "assinaturaNaoAtiva" }

  const direcao = direcaoDaTroca(pedido)
  if (direcao === "mesmo") return { ok: false, motivo: "mesmoPlano" }

  return {
    ok: true,
    direcao,
    valorNovo: precoCheio(pedido.novo, pedido.combinado, pedido.ciclo),
    // Subir entrega já; descer espera o fim do que foi pago.
    valeApartirDe: direcao === "subir" ? "agora" : "fimDoPeriodo",
  }
}

/**
 * A troca agendada já venceu?
 *
 * Usado nos DOIS lugares que aplicam o agendamento: a confirmação do pagamento
 * da renovação (o momento natural — começa um ciclo novo) e o cron diário, que
 * é a rede de segurança para a assinatura que não renovou.
 */
export function chegouAHora(
  sub: { pendingPlanId: string | null; currentPeriodEnd: Date },
  agora: Date
): boolean {
  return sub.pendingPlanId !== null && sub.currentPeriodEnd.getTime() <= agora.getTime()
}
