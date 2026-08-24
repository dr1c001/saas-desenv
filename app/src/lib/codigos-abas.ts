// Código numérico de cada tela, para chegar nela digitando o número.
//
// A ideia é a de um menu de PABX ou de catálogo de peças: quem usa o sistema
// todo dia decora "1.1" e chega mais rápido do que caçando na barra lateral.
// Quem não decorou continua achando pelo nome — a busca aceita os dois, e um
// código que só funciona se você souber de cor seria um atalho para ninguém.
//
// ─── Como os números são organizados ─────────────────────────────────────────
//
//   1.x   Operação — o trabalho em campo
//   2.x   Clientes
//   3.x   Dinheiro
//   4.x   Estoque e compras
//   5.x   Empresa — configuração e equipe
//
// O terceiro nível existe só onde há tela dentro de tela (Configurações), e
// não para inventar profundidade: 5.5.2 é "Configurações › Permissões".
//
// RENUMERAR é mexer numa linha daqui. O número não está escrito em mais lugar
// nenhum — nem na rota, nem no menu, nem no banco. Foi feito assim de propósito:
// numeração é convenção de quem usa, e convenção muda.

import { ALL_TABS, type TabSlug } from "./abas"

export type Destino = {
  /** O número que se digita. */
  codigo: string
  /** Para onde vai. */
  rota: string
  /** Chave de tradução do nome, no namespace `nav`. */
  navKey: string
  /** A aba que governa o acesso. `null` = tela que todo OWNER/ADMIN alcança. */
  aba: TabSlug | null
  /** Só dono e administrador. */
  soAdmin?: boolean
}

export const DESTINOS: readonly Destino[] = [
  // ── 1. Operação ───────────────────────────────────────────────────────────
  { codigo: "1.1", rota: "/service-orders", navKey: "serviceOrders", aba: "service-orders" },
  { codigo: "1.2", rota: "/schedule", navKey: "schedule", aba: "schedule" },
  { codigo: "1.3", rota: "/history", navKey: "history", aba: "history" },
  { codigo: "1.4", rota: "/maintenance", navKey: "maintenance", aba: "maintenance" },
  { codigo: "1.5", rota: "/map", navKey: "map", aba: "map" },
  { codigo: "1.6", rota: "/dashboard", navKey: "dashboard", aba: "dashboard" },

  // ── 2. Clientes ───────────────────────────────────────────────────────────
  { codigo: "2.1", rota: "/clients", navKey: "clients", aba: "clients" },
  { codigo: "2.2", rota: "/contracts", navKey: "contracts", aba: "contracts" },

  // ── 3. Dinheiro ───────────────────────────────────────────────────────────
  { codigo: "3.1", rota: "/finance", navKey: "finance", aba: "finance" },
  { codigo: "3.2", rota: "/quotes", navKey: "quotes", aba: "quotes" },
  { codigo: "3.3", rota: "/receipts", navKey: "receipts", aba: "receipts" },
  // A tela mora em /settings/fiscal, mas aparece no MENU como aba própria —
  // por isso o código é do grupo Dinheiro, e não do de Configurações.
  { codigo: "3.4", rota: "/settings/fiscal", navKey: "fiscal", aba: "fiscal" },
  { codigo: "3.5", rota: "/billing", navKey: "billing", aba: "billing" },

  // ── 4. Estoque e compras ──────────────────────────────────────────────────
  { codigo: "4.1", rota: "/parts", navKey: "parts", aba: "parts" },
  { codigo: "4.2", rota: "/purchases", navKey: "purchases", aba: "purchases" },
  { codigo: "4.3", rota: "/providers", navKey: "providers", aba: "providers" },

  // ── 5. Empresa ────────────────────────────────────────────────────────────
  { codigo: "5.1", rota: "/team", navKey: "team", aba: "team" },
  { codigo: "5.2", rota: "/reports", navKey: "reports", aba: "reports" },
  { codigo: "5.3", rota: "/referral", navKey: "referral", aba: "referral" },
  { codigo: "5.4", rota: "/settings", navKey: "settings", aba: null, soAdmin: true },
  // Terceiro nível: telas DENTRO de Configurações.
  { codigo: "5.4.1", rota: "/settings/permissions", navKey: "permissions", aba: null, soAdmin: true },
  { codigo: "5.4.2", rota: "/settings/fields", navKey: "customFields", aba: null, soAdmin: true },
  { codigo: "5.4.3", rota: "/settings/vocabulary", navKey: "vocabulary", aba: null, soAdmin: true },
  { codigo: "5.4.4", rota: "/settings/filiais", navKey: "filiais", aba: null, soAdmin: true },
  { codigo: "5.4.5", rota: "/settings/api", navKey: "apiKeys", aba: null, soAdmin: true },
]

/**
 * O código de uma ABA, para o menu mostrar o número na frente do nome.
 *
 * Por aba, e não por rota: o teste "toda aba do menu tem um código" já garante
 * que toda aba de ALL_TABS aparece aqui, então esta busca nunca volta vazia
 * para um item do menu. Por rota, um href escrito diferente da rota do
 * catálogo faria o número sumir da tela sem nada acusar.
 */
export function codigoDaAba(aba: string): string | null {
  return DESTINOS.find((d) => d.aba === aba)?.codigo ?? null
}

/** O código de uma rota, para o menu mostrar o número na frente do nome. */
export function codigoDaRota(rota: string): string | null {
  return DESTINOS.find((d) => d.rota === rota)?.codigo ?? null
}

/**
 * Ordena por código como NÚMERO, e não como texto.
 *
 * Comparar "1.10" com "1.2" por ordem alfabética põe o 10 antes do 2. Hoje
 * nenhum grupo passa de nove telas, mas o menu é ordenado por este código na
 * barra lateral — o dia em que passar, a lista embaralharia sozinha.
 */
export function compararCodigo(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

/**
 * O código da tela que está aberta agora, a partir do caminho da URL.
 *
 * É o que permite o botão de ajuda abrir o manual JÁ no verbete daquela tela.
 *
 * Casa pelo caminho MAIS LONGO, e não pelo primeiro que serve. `/settings` é
 * prefixo de `/settings/fiscal`, e `/service-orders/42` precisa cair em
 * `/service-orders` — pegar o primeiro daria "Configurações" para quem está na
 * tela Fiscal, que é justamente a ajuda errada.
 */
export function codigoDaTelaAtual(caminho: string): string | null {
  let achado: Destino | null = null
  for (const d of DESTINOS) {
    const serve = caminho === d.rota || caminho.startsWith(`${d.rota}/`)
    if (serve && (!achado || d.rota.length > achado.rota.length)) achado = d
  }
  return achado?.codigo ?? null
}

/** Um código digitado, normalizado: aceita "1,1" e "1 1" além de "1.1". */
export function normalizarCodigo(entrada: string): string {
  return entrada.trim().replace(/[,\s]+/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "")
}

/** O texto digitado parece um código, e não o nome de uma tela? */
export function pareceCodigo(entrada: string): boolean {
  return /^\d+([.,\s]\d+)*$/.test(entrada.trim())
}

/**
 * Para onde ir, dado o que a pessoa digitou.
 *
 * Devolve LISTA, não um destino: "5.4" é um destino e também o começo de seis
 * outros, então quem digita o prefixo vê as opções em vez de ser levado para
 * uma delas por adivinhação. Exato primeiro, prefixos depois.
 */
export function destinosPorCodigo(entrada: string): Destino[] {
  const c = normalizarCodigo(entrada)
  if (!c) return []
  const exato = DESTINOS.filter((d) => d.codigo === c)
  const prefixo = DESTINOS.filter((d) => d.codigo !== c && d.codigo.startsWith(`${c}.`))
  return [...exato, ...prefixo]
}

/**
 * Filtra pelo que a pessoa PODE ver.
 *
 * Esconder o destino é cortesia, não proteção — a rota se defende sozinha, e a
 * URL sempre foi digitável. Mas oferecer um atalho que leva a uma tela que
 * redireciona de volta é pior que não oferecer atalho nenhum.
 */
export function destinosPermitidos(
  destinos: readonly Destino[],
  abasPermitidas: readonly string[],
  ehAdmin: boolean
): Destino[] {
  return destinos.filter((d) => {
    if (d.soAdmin && !ehAdmin) return false
    return d.aba === null ? ehAdmin : abasPermitidas.includes(d.aba)
  })
}

/** Confere que todo destino aponta para uma aba que existe. Usado no teste —
 *  um slug digitado errado aqui vira um atalho que nunca aparece para ninguém. */
export function abasInvalidas(): string[] {
  const conhecidas = new Set<string>(ALL_TABS.map((t) => t.slug))
  return DESTINOS.filter((d) => d.aba !== null && !conhecidas.has(d.aba)).map((d) => d.codigo)
}
