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
  | "filiais"         // Mais de uma unidade — SÓ Enterprise (ver lib/plan.ts)

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
]

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
