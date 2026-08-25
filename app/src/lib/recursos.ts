// Catálogo dos recursos pagos. Módulo PURO de propósito.
//
// Mora separado de lib/plan.ts porque aquele importa o Prisma, e componente de
// cliente que precise só do nome dos recursos acabaria arrastando o driver do
// Postgres para o pacote do navegador — o build quebra com "Can't resolve
// 'dns'", que não diz nada sobre a causa. (Aconteceu ao montar a tela de
// conceder recurso no painel, 18/08/2026.)
//
// Aqui só entram o tipo e as listas. Quem precisa saber o que cada PLANO
// libera continua em lib/plan.ts, que fala com o banco.

export type Recurso =
  | "gpsMap"          // Mapa GPS
  | "nfse"            // Emissão de NFS-e
  | "signature"       // Assinatura digital do cliente
  | "checklist"       // Checklist de execução
  | "advancedReports" // Período personalizado, ranking de clientes, detalhamento
  | "stock"           // Estoque de peças e ordens de compra
  | "api"             // API de integração — SÓ Enterprise (ver lib/plan.ts)
  | "filiais"         // Mais de uma unidade — ADICIONAL (ver lib/plan.ts)
  | "ia"              // Assistente de voz — ADICIONAL, nenhum plano inclui

/** Todos os recursos que existem. Fonte única — a tela do painel monta a partir daqui. */
export const RECURSOS: readonly Recurso[] = [
  "gpsMap",
  "nfse",
  "signature",
  "checklist",
  "advancedReports",
  "stock",
  "api",
  "filiais",
  "ia",
]

/**
 * Vendidos À PARTE. Nenhum plano inclui — só a concessão individual libera.
 *
 * É uma terceira categoria, ao lado de "vem no plano" e "só no Enterprise".
 *
 * Entram aqui por motivos DIFERENTES, e vale não confundi-los:
 *
 *   `ia` — tem CUSTO POR USO: cada comando consome API paga. Embutir num plano
 *   de preço fixo faria o cliente que mais fala com ela ser o que menos dá
 *   lucro, e não há como prever qual vai ser.
 *
 *   `filiais` — não custa por uso; é recurso de uma MINORIA com necessidade
 *   específica. Preso atrás do Enterprise, obrigava quem só quer duas unidades
 *   a pagar por usuários ilimitados e atendimento que não pediu. Vendido à
 *   parte, alcança também quem está no Starter.
 *
 * O teste que guarda isto está em __tests__/plan.test.ts: nenhum plano pode
 * passar a incluir um adicional sem alguém decidir explicitamente.
 */
export const ADICIONAIS: readonly Recurso[] = ["ia", "filiais"]

/** Franquia mensal de comandos quando o adicional é concedido e a empresa não
 *  tem teto próprio.
 *
 *  Existe para conceder o adicional nunca resultar em "liberado, com zero
 *  comandos" — que é o que aconteceria se a franquia herdasse de um plano que
 *  não inclui o recurso. */
export const IA_COMANDOS_PADRAO = 500

/**
 * Quais recursos desbloqueiam uma ABA do menu (ver ABAS_POR_RECURSO em
 * lib/auth.ts). Os demais são funcionalidade dentro de página. A tela do painel
 * mostra essa diferença porque conceder "Mapa GPS" e conceder "Checklist" têm
 * efeitos bem diferentes pra quem está do outro lado.
 */
export const RECURSOS_DE_ABA: readonly Recurso[] = ["gpsMap", "nfse", "stock"]

export function ehRecurso(valor: string): valor is Recurso {
  return (RECURSOS as readonly string[]).includes(valor)
}
