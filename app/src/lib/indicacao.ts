// Os números da indicação, num lugar só.
//
// ─── Por que um módulo, e por que PURO ───────────────────────────────────────
//
// O percentual de quem é indicado morava privado em lib/auth.ts, e o de quem
// indica em lib/confirmar-pagamento.ts — os dois com um comentário dizendo que
// "espelham" o valor em `api/referral/join/route.ts`. Esse arquivo NÃO EXISTE
// (foi removido em algum momento e os comentários ficaram), então a instrução
// que os dois davam ao próximo leitor apontava para o nada.
//
// Ao mesmo tempo, o número 10 estava escrito à mão em quatro textos de venda
// (auth.register.refBanner e auth.register.subtitleWithRef, nos dois idiomas).
// Mudar o percentual exigia lembrar de seis lugares, e esquecer um deles faz o
// sistema prometer uma coisa e conceder outra — que é o defeito que este grupo
// inteiro persegue.
//
// PURO de propósito, como lib/recursos.ts e pela mesma razão: a tela de
// cadastro é componente de cliente, e importar daqui não pode arrastar o
// Prisma para o pacote do navegador.
// (Achado na auditoria de 13/09/2026, grupo 9.)

/** Quem chega por indicação: desconto no PRIMEIRO PAGAMENTO, não na mensalidade. */
export const DESCONTO_DE_QUEM_E_INDICADO = 10

/** Quem indicou, quando o indicado paga a primeira fatura. Acumula. */
export const DESCONTO_DE_QUEM_INDICA = 20

/** O teto do acúmulo de quem indica muita gente. */
export const TETO_DE_DESCONTO = 100

/**
 * O que a tela de cadastro sabe sobre o código que veio na URL.
 *
 * Três estados, e não dois. Tratar "não deu para conferir" como "inválido"
 * recria a mentira pelo lado oposto: o visitante com um código BOM leria que
 * ele não vale, no momento exato da conversão.
 */
export type EstadoDaIndicacao = "conferindo" | "valido" | "invalido" | "naoConferido"
