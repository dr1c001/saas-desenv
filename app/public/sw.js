// Service worker do ServiçoOS: notificações push + modo offline.
//
// O técnico em campo é o caso de uso que manda aqui: ele chega num subsolo,
// num galpão ou numa zona rural sem sinal e precisa ver a OS, o endereço e o
// telefone do cliente. Antes, sem rede, o navegador mostrava a tela de "sem
// internet" e o aplicativo era simplesmente inútil.
//
// O que ESTÁ coberto: o app abre offline, toda página que o técnico já visitou
// com sinal continua abrindo, e CONCLUIR ou MUDAR O STATUS de uma OS funciona
// sem rede — vai para a fila em IndexedDB (lib/fila-offline.ts) e sobe sozinho
// quando o sinal volta. O que NÃO está: criar OS nova offline, que precisaria
// gerar número e conferir limite de plano no servidor.

// v4 (04/09/2026): o painel do admin passou a ABRIR sem rede, com pagina
// propria. Ele continua FORA do cache (a lista NUNCA_CACHEAR nao mudou) — o
// que mudou e ter resposta em vez de nada: numa janela instalada, sem barra de
// endereco e sem botao de recarregar, a tela de dinossauro parece o aplicativo
// morto. O Chrome tambem confere se o service worker responde a navegacao
// offline antes de OFERECER a instalacao.
//
// v3 (22/08/2026): o push passou a repassar silent, requireInteraction e tag.
// A versao PRECISA subir a cada mudanca aqui — sem isso o navegador segue com
// o service worker antigo em cache e as opcoes novas sao ignoradas em silencio.
const VERSAO = "v4"
const CACHE_SHELL = `servicoos-shell-${VERSAO}`
const CACHE_PAGINAS = `servicoos-paginas-${VERSAO}`
const CACHE_ESTATICOS = `servicoos-estaticos-${VERSAO}`
const CACHES_ATUAIS = [CACHE_SHELL, CACHE_PAGINAS, CACHE_ESTATICOS]

const PAGINA_OFFLINE = "/offline"
// O texto do /offline e do TECNICO em campo, e promete o que o painel nao faz:
// "concluir e mudar status funcionam sem sinal". O dono precisa ler outra
// frase — o painel mostra o estado de AGORA, e por isso precisa de internet.
const PAGINA_OFFLINE_ADMIN = "/offline/admin"

// Nunca guardar: dados de API (ficam velhos e enganam), telas de autenticação
// (guardar uma tela de login "logada" é pedir confusão) e o painel do admin.
const NUNCA_CACHEAR = ["/api/", "/login", "/register", "/forgot-password", "/reset-password", "/expired", "/admin"]

// ─── Instalação: guarda o mínimo pro app abrir sem rede ──────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL)
      // Um a um, com catch: addAll() falha inteiro se UM arquivo falhar, e aí
      // a instalação do service worker inteira é abortada.
      //
      // `fetch` + `podeGuardar` + `cache.put`, e NÃO `cache.add`. O add segue
      // redirect e guardaria o HTML do LOGIN sob a chave da página offline —
      // e resposta redirecionada é recusada pelo navegador quando servida em
      // navegação, então a página offline simplesmente não apareceria. Isso
      // rodaria no aparelho de TODO técnico, calado.
      for (const url of [
        PAGINA_OFFLINE,
        PAGINA_OFFLINE_ADMIN,
        "/icon-192.png",
        "/icon-512.png",
        "/icon-admin-192.png",
        "/icon-admin-512.png",
        "/manifest.json",
        "/manifest-admin.json",
      ]) {
        try {
          const res = await fetch(new Request(url, { cache: "reload" }))
          if (podeGuardar(res)) await cache.put(url, res)
        } catch {}
      }
      await self.skipWaiting()
    })()
  )
})

// ─── Ativação: joga fora cache de versão antiga ──────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys()
      await Promise.all(
        nomes.filter((n) => n.startsWith("servicoos-") && !CACHES_ATUAIS.includes(n)).map((n) => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

// ─── Estratégias ─────────────────────────────────────────────────────────────

// Só vale guardar resposta 200 e não-redirecionada: um 307 pro /login guardado
// no lugar de uma página quebraria a navegação seguinte de um jeito difícil de
// diagnosticar (o navegador recusa resposta redirecionada em navegação).
function podeGuardar(res) {
  return res && res.status === 200 && !res.redirected && res.type === "basic"
}

async function redePrimeiro(req, nomeCache) {
  try {
    const res = await fetch(req)
    if (podeGuardar(res)) {
      const cache = await caches.open(nomeCache)
      cache.put(req, res.clone())
    }
    return res
  } catch (err) {
    const guardada = await caches.match(req)
    if (guardada) return guardada
    throw err
  }
}

async function cachePrimeiro(req, nomeCache) {
  const guardada = await caches.match(req)
  if (guardada) return guardada
  const res = await fetch(req)
  if (podeGuardar(res)) {
    const cache = await caches.open(nomeCache)
    cache.put(req, res.clone())
  }
  return res
}

function paginaOfflineDe(pathname) {
  return pathname.startsWith("/admin") ? PAGINA_OFFLINE_ADMIN : PAGINA_OFFLINE
}

async function semConexao(pathname) {
  // O CORPO da resposta, nunca um redirect: resposta redirecionada é recusada
  // pelo navegador em navegação, e um redirect de verdade tiraria a URL do
  // escopo /admin — a janela instalada abriria a barra de endereço.
  const offline = await caches.match(paginaOfflineDe(pathname))
  return (
    offline ??
    new Response("Sem conexão.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  )
}

async function navegacao(req) {
  try {
    return await redePrimeiro(req, CACHE_PAGINAS)
  } catch {
    // Nem rede nem cópia guardada desta página: explica o que houve em vez de
    // entregar a tela de dinossauro do navegador.
    return semConexao(new URL(req.url).pathname)
  }
}

/**
 * Vai à rede e NADA é guardado.
 *
 * É o painel do dono: ele mostra o estado de agora do negócio — MRR,
 * inadimplentes, assinaturas —, e um número de ontem ali é pior que painel
 * nenhum. Por isso o disco continua intocado.
 *
 * O que mudou da v3 para cá é só ter RESPOSTA quando não há rede. Antes o
 * service worker se afastava com um `return` cru; num navegador comum o custo
 * era a tela de dinossauro, mas numa janela instalada — sem barra de endereço e
 * sem botão de recarregar — a mesma tela parece o aplicativo morto.
 */
async function redeSemGuardar(req) {
  try {
    return await fetch(req)
  } catch {
    return semConexao(new URL(req.url).pathname)
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request

  // Server Actions e envios de formulário são POST. Nunca interceptar: uma
  // escrita respondida pelo cache seria pior que um erro de rede honesto.
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // O que nunca é guardado: fora de navegação o service worker se afasta; EM
  // navegação ele vai à rede e, sem rede, responde a página offline. Guardar e
  // ABRIR são coisas diferentes, e antes as duas eram resolvidas pela mesma
  // linha de `return`. Regra e casos em src/lib/sw-estrategia.ts.
  if (NUNCA_CACHEAR.some((p) => url.pathname.startsWith(p))) {
    if (req.mode === "navigate") event.respondWith(redeSemGuardar(req))
    return
  }

  // Payload de navegação do App Router (?_rsc=...). Fica de fora de propósito:
  // a mesma URL devolve conteúdo diferente conforme os cabeçalhos de roteamento
  // do Next, então guardar por URL serviria a resposta errada. Consequência
  // assumida: offline, clicar num link do menu falha — recarregar a página
  // entrega a versão guardada.
  if (url.searchParams.has("_rsc")) return

  if (req.mode === "navigate") {
    event.respondWith(navegacao(req))
    return
  }

  // Estáticos do Next têm hash no nome: imutáveis, cache primeiro sem medo.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cachePrimeiro(req, CACHE_ESTATICOS))
    return
  }

  if (req.destination === "image" || req.destination === "font" || req.destination === "style" || req.destination === "script") {
    event.respondWith(cachePrimeiro(req, CACHE_ESTATICOS))
  }
})

// ─── Limpeza no logout ───────────────────────────────────────────────────────
// O cache guarda HTML já renderizado com dados da empresa. Num aparelho
// compartilhado, sair da conta tem que levar isso junto — senão o próximo a
// usar abre o app offline e vê a carteira de clientes de quem saiu.
self.addEventListener("message", (event) => {
  if (event.data?.tipo === "LIMPAR_CACHE") {
    event.waitUntil(
      caches.keys().then((nomes) =>
        Promise.all(nomes.filter((n) => n.startsWith("servicoos-")).map((n) => caches.delete(n)))
      )
    )
  }
})

// ─── Notificações push ───────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
      // Sem som nem vibração quando a pessoa pediu silêncio. Não existe opção
      // de TOQUE: a propriedade `sound` foi removida da especificação e nenhum
      // navegador implementa — o som vem do canal de notificação do sistema.
      silent: data.silent === true,
      vibrate: data.silent === true ? undefined : [200, 100, 200],
      // Fica na tela até ser tocada, no que exige ação de alguém.
      requireInteraction: data.requireInteraction === true,
      // Mesma etiqueta substitui a anterior: dez mudanças de status da mesma
      // OS viram uma notificação com o estado atual, não dez empilhadas.
      tag: data.tag,
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
