// Os adicionais e o que eles custam.
//
// Modulo PURO e sem Prisma: e lido pela tela de planos (dentro do sistema) e
// pela landing (fora dele), e a landing nao pode arrastar o driver do Postgres
// para o pacote do navegador — mesmo motivo de lib/recursos.ts existir separado
// de lib/plan.ts.
//
// ─── Por que o preco mora AQUI, e num lugar so ───────────────────────────────
//
// Ele aparece na tela de planos, e o NOME e a descricao aparecem tambem na
// landing. Espalhar o valor por esses lugares garantiria o dia em que um deles
// e atualizado e o outro nao — e o cliente veria um preco na vitrine e outro
// na hora de contratar.
//
// Mudar preco e mexer numa linha deste arquivo.

import { ADICIONAIS, type Recurso } from "./recursos"

export type Adicional = {
  recurso: Recurso
  /**
   * Mensalidade em reais.
   *
   * `null` = SOB CONSULTA, e nao "de graca". Serve para o adicional cujo preco
   * ainda nao foi decidido: melhor a pessoa falar com a empresa do que ver um
   * numero que vai mudar.
   */
  precoMensal: number | null
}

export const CATALOGO_DE_ADICIONAIS: readonly Adicional[] = [
  {
    recurso: "filiais",
    // Preco por VALOR, e nao por custo: filiais nao consome nada a mais para
    // servir. O que ele resolve e o salto de plano — sem o adicional, quem tem
    // duas unidades precisaria pular de R$ 97 para R$ 397 e pagar por usuarios
    // ilimitados e atendimento que nao pediu.
    precoMensal: 49,
  },
  {
    recurso: "ia",
    // SOB CONSULTA de proposito, ate o custo por comando ser MEDIDO.
    //
    // A assistente e o unico recurso do sistema com custo por uso: cada comando
    // consome API paga. Anunciar preco antes de saber quanto custam os 500
    // comandos da franquia mensal e o jeito de descobrir tarde que o cliente
    // que mais usa e o que da prejuizo.
    //
    // Depois de medir: trocar `null` pelo valor aqui, e ele aparece na tela de
    // planos sozinho.
    precoMensal: null,
  },
]

/** O catalogo, so com o que ainda existe como recurso. Guarda contra um
 *  adicional removido de lib/recursos.ts continuar sendo anunciado. */
export function adicionaisAVenda(): Adicional[] {
  return CATALOGO_DE_ADICIONAIS.filter((a) =>
    (ADICIONAIS as readonly string[]).includes(a.recurso)
  )
}

export function precoDoAdicional(recurso: string): number | null {
  return CATALOGO_DE_ADICIONAIS.find((a) => a.recurso === recurso)?.precoMensal ?? null
}
