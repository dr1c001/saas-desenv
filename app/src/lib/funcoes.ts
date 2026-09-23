// Funções que podem ser DESLIGADAS por empresa.
//
// Diferente de lib/recursos.ts, e a diferença importa:
//
//   Recurso  → o que um PLANO vende. Nasce desligado, o plano liga.
//   Função   → o que o sistema faz para todo mundo. Nasce LIGADA, e o dono da
//              plataforma desliga para uma empresa específica.
//
// Por isso o armazenamento é uma lista de DESLIGADAS, e não de ligadas: lista
// vazia significa "tudo funcionando", que é exatamente o comportamento de
// hoje. Nenhuma empresa muda de comportamento no dia em que a chave passa a
// existir — e essa é a única forma segura de criar interruptor para coisa que
// já está em uso. Uma lista de "ligadas" começaria vazia e apagaria o sistema
// inteiro de todo mundo.
//
// ─── O que NÃO entra aqui ────────────────────────────────────────────────────
//
// Levantando as 23 funções sem trava do sistema, 13 ficaram de fora por três
// motivos, e nenhum deles é esquecimento:
//
//  1. É o produto, não um extra: criar conta, entrar, recuperar senha.
//  2. É NOSSO, não da empresa cliente: cobrança, aviso de atraso, liberação
//     após pagamento, monitoramento, página de status, backup. Desligar isso
//     para uma empresa não a beneficia — quebra a nossa operação.
//  3. Já tem dono: baixa de peça e histórico de movimentação pertencem ao
//     recurso `stock`; geração de OS de contrato pertence a Contratos; a
//     receita criada ao faturar é o próprio módulo financeiro, e desligá-la
//     deixaria OS faturada sem lançamento — livro-caixa furado, não economia.

export type Funcao =
  | "osPdf"            // PDF da ordem de serviço
  | "osHistorico"      // Linha do tempo de alterações da OS
  | "offline"          // Trabalho sem internet
  | "portalCliente"    // Acompanhamento pelo link público
  | "nps"              // Pesquisa de satisfação
  | "geocodificacao"   // Endereço vira ponto no mapa — CONSOME CRÉDITO PAGO
  | "orcamentoPdf"     // Orçamento em PDF
  | "orcamentoOnline"  // Cliente aprova o orçamento pelo link
  | "primeirosPassos"  // Painel de configuração inicial
  | "push"             // Notificação no celular da equipe

/** Fonte única. A tela do painel monta a lista a partir daqui. */
export const FUNCOES: readonly Funcao[] = [
  "osPdf",
  "osHistorico",
  "offline",
  "portalCliente",
  "nps",
  "geocodificacao",
  "orcamentoPdf",
  "orcamentoOnline",
  "primeirosPassos",
  "push",
]

/**
 * As que custam dinheiro por uso.
 *
 * A tela do painel destaca estas: desligar as outras é decisão comercial, e
 * desligar uma destas também economiza — e essa é uma informação que quem
 * negocia precisa ver na hora.
 */
export const FUNCOES_COM_CUSTO: readonly Funcao[] = ["geocodificacao", "push"]

export function ehFuncao(valor: string): valor is Funcao {
  return (FUNCOES as readonly string[]).includes(valor)
}

/**
 * Está ligada?
 *
 * O padrão é SIM. Uma chave desconhecida na lista de desligadas é ignorada em
 * vez de derrubar tudo: valor antigo ou digitado errado no banco não pode
 * desligar uma função que ninguém pediu para desligar.
 */
export function funcaoLigada(funcao: Funcao, desligadas: readonly string[]): boolean {
  return !desligadas.includes(funcao)
}

/** Só as chaves que o código conhece — o resto é ruído de edição manual. */
export function desligadasValidas(valores: readonly string[]): Funcao[] {
  return [...new Set(valores.filter(ehFuncao))]
}
