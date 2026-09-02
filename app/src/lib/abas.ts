// Catálogo das abas do menu. Módulo PURO, pelo mesmo motivo de lib/recursos.ts:
// lib/auth.ts importa o Prisma, e componente de cliente que só precise da LISTA
// de abas acabaria arrastando o driver do Postgres pro navegador.
//
// O rótulo NÃO vive aqui: este é um const de módulo (sem request context pra
// resolver idioma) e os mesmos nomes já existem traduzidos no namespace `nav`,
// usado pela sidebar — duplicar aqui deixaria a tela de Permissões em português
// fixo mesmo com a conta em inglês. navKey mapeia slug → chave de nav.
// (i18n, 07/08/2026.)

import type { Recurso } from "./recursos"

export const ALL_TABS = [
  { slug: "dashboard", navKey: "dashboard" },
  { slug: "clients", navKey: "clients" },
  { slug: "service-orders", navKey: "serviceOrders" },
  { slug: "contracts", navKey: "contracts" },
  { slug: "history", navKey: "history" },
  { slug: "maintenance", navKey: "maintenance" },
  { slug: "providers", navKey: "providers" },
  { slug: "receipts", navKey: "receipts" },
  { slug: "schedule", navKey: "schedule" },
  { slug: "finance", navKey: "finance" },
  { slug: "reports", navKey: "reports" },
  { slug: "team", navKey: "team" },
  { slug: "map", navKey: "map" },
  { slug: "quotes", navKey: "quotes" },
  { slug: "billing", navKey: "billing" },
  { slug: "fiscal", navKey: "fiscal" },
  { slug: "parts", navKey: "parts" },
  { slug: "purchases", navKey: "purchases" },
  { slug: "notas", navKey: "notas" },
  { slug: "cotacoes", navKey: "cotacoes" },
  { slug: "referral", navKey: "referral" },
] as const

export type TabSlug = (typeof ALL_TABS)[number]["slug"]

// Abas que só existem se o plano incluir o recurso correspondente. Filtrar por
// aqui esconde a aba do menu em um lugar só; a página e a rota de API de cada
// uma continuam se defendendo por conta própria (menu escondido não é proteção
// — a URL continua digitável).
export const ABAS_POR_RECURSO: { slug: TabSlug; recurso: Recurso }[] = [
  { slug: "map", recurso: "gpsMap" },
  { slug: "fiscal", recurso: "nfse" },
  // As duas do estoque andam juntas: ordem de compra sem catálogo de peça não
  // tem o que comprar, e catálogo sem compra vira digitação manual eterna.
  { slug: "parts", recurso: "stock" },
  { slug: "purchases", recurso: "stock" },
  // As notas do fornecedor vem das ordens de compra: sem o estoque nao ha
  // compra, e sem compra nao ha nota para guardar.
  { slug: "notas", recurso: "stock" },
  { slug: "cotacoes", recurso: "stock" },
]

/**
 * As abas que um OWNER/ADMIN desta empresa enxerga, dados os recursos dela.
 *
 * Puro de propósito: a tela do painel usa isto pra mostrar, ao vivo, o efeito
 * de marcar um recurso — a pessoa vê "Mapa GPS" acender na lista de abas no
 * mesmo clique, em vez de precisar salvar e adivinhar.
 */
export function abasVisiveis(recursos: readonly Recurso[]): TabSlug[] {
  const bloqueadas = new Set(
    ABAS_POR_RECURSO.filter((a) => !recursos.includes(a.recurso)).map((a) => a.slug)
  )
  return ALL_TABS.map((t) => t.slug).filter((s) => !bloqueadas.has(s))
}
