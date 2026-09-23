// O que o service worker faz com cada requisição.
//
// ─── Por que isto existe fora do sw.js ───────────────────────────────────────
//
// `public/sw.js` é servido cru pelo navegador: ele não passa pelo empacotador,
// então não pode importar de `src/`. A decisão mora aqui, testável, e o sw.js
// mantém a cópia literal — com um teste comparando as duas para não desandarem.
//
// Não é elegante. É honesto: a alternativa era a regra viver só num arquivo que
// nenhum teste alcança, e ela decide se o painel abre ou mostra a tela de
// dinossauro dentro de uma janela sem barra de endereço.

/**
 * Caminhos que NUNCA são guardados.
 *
 * Dados de API ficam velhos e enganam; telas de autenticação guardadas
 * "logadas" pedem confusão; e o painel do dono mostra o estado de AGORA do
 * negócio — MRR, inadimplentes, assinaturas. Um número de ontem ali é pior que
 * painel nenhum.
 *
 * Não guardar é diferente de não abrir: ver `estrategiaPara`.
 */
export const NUNCA_CACHEAR = [
  "/api/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/expired",
  "/admin",
] as const

export type Estrategia =
  /** O service worker não se mete. */
  | "ignorar"
  /** Vai à rede e responde; se falhar, a página offline. Nada é guardado. */
  | "rede-sem-guardar"
  /** Rede primeiro, guardando; offline cai na cópia ou na página offline. */
  | "navegacao"
  /** Cache primeiro. Só para o que é imutável. */
  | "cache-primeiro"

export type Requisicao = {
  pathname: string
  /** `req.mode`: "navigate" quando é a página em si. */
  mode?: string
  /** `req.destination`: "image", "font", "style", "script"... */
  destination?: string
  /** A URL tem `?_rsc=` — payload de navegação do App Router. */
  temRsc?: boolean
  /** `req.method !== "GET"`. */
  ehEscrita?: boolean
  /** Outro domínio. */
  ehExterno?: boolean
}

/**
 * A decisão.
 *
 * ─── O conserto que a versão instalada exigia ────────────────────────────────
 *
 * Antes, tudo em `NUNCA_CACHEAR` recebia um `return` cru: o service worker se
 * afastava e o navegador tratava sozinho. Num navegador comum, o custo era a
 * tela de dinossauro. Numa JANELA INSTALADA — sem barra de endereço e sem botão
 * de recarregar — a mesma tela parece o aplicativo morto.
 *
 * Agora o painel tem "rede-sem-guardar": vai à rede sempre, nada vai para o
 * disco, e quando não há rede responde a página offline do painel. O dado
 * continua nunca sendo guardado; o que muda é ter resposta em vez de nada.
 *
 * O Chrome também confere se o service worker responde a uma navegação offline
 * antes de OFERECER a instalação — sem isto, o botão de instalar pode nem
 * aparecer.
 */
export function estrategiaPara(req: Requisicao): Estrategia {
  // Escrita nunca passa pelo cache: uma Server Action respondida por cópia
  // guardada seria pior que um erro de rede honesto.
  if (req.ehEscrita) return "ignorar"
  if (req.ehExterno) return "ignorar"

  // Payload de navegação do App Router: a mesma URL devolve conteúdo diferente
  // conforme os cabeçalhos de roteamento, então guardar por URL serviria a
  // resposta errada.
  if (req.temRsc) return "ignorar"

  const protegido = NUNCA_CACHEAR.some((p) => req.pathname.startsWith(p))

  if (req.mode === "navigate") {
    return protegido ? "rede-sem-guardar" : "navegacao"
  }

  // Fora de navegação, o que é protegido continua fora do alcance por completo.
  if (protegido) return "ignorar"

  // Estáticos do Next têm hash no nome: imutáveis.
  if (req.pathname.startsWith("/_next/static/")) return "cache-primeiro"

  if (["image", "font", "style", "script"].includes(req.destination ?? "")) {
    return "cache-primeiro"
  }

  return "ignorar"
}

/**
 * Qual página offline responde a esta navegação.
 *
 * O texto de `/offline` é do técnico em campo e promete o que o painel não faz
 * ("concluir e mudar status funcionam sem sinal"). O dono precisa ler outra
 * frase: o painel mostra o estado de agora, e por isso precisa de internet.
 */
export function paginaOfflineDe(pathname: string): "/offline" | "/offline/admin" {
  return pathname.startsWith("/admin") ? "/offline/admin" : "/offline"
}
