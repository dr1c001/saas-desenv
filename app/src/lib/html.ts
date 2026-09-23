/**
 * Texto de gente dentro de HTML montado na mão.
 *
 * Os e-mails (lib/resend.ts) e o balão do mapa montam HTML por template
 * string. Todo valor que veio do usuário — nome da empresa, do cliente, título
 * da OS — passa aqui antes de entrar no template, senão vira tag: "Silva & Cia
 * <Refrigeração>" perde a palavra entre < >, e um `<img onerror=...>` no nome
 * da empresa executaria na caixa de entrada de um terceiro, saindo do nosso
 * domínio autenticado como remetente.
 *
 * Até 15/09/2026 o escape vivia colado numa única variável de resend.ts — e o
 * <h2> com o nome da empresa, na linha logo acima, saía cru. Sem um helper com
 * nome não havia o que chamar; por isso ele existe. (Achado na auditoria de
 * 13/09/2026.)
 *
 * O & vai PRIMEIRO: trocá-lo por último reescreveria o "&lt;" recém-criado
 * como "&amp;lt;".
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
