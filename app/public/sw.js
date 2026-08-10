// Service worker do ServiçoOS: notificações push + modo offline.
//
// O técnico em campo é o caso de uso que manda aqui: ele chega num subsolo,
// num galpão ou numa zona rural sem sinal e precisa ver a OS, o endereço e o
// telefone do cliente. Antes, sem rede, o navegador mostrava a tela de "sem
// internet" e o aplicativo era simplesmente inútil.
//
// O que ESTÁ coberto: o app abre offline, e toda página que o técnico já
// visitou com sinal continua abrindo. O que NÃO está: gravar offline. Criar
// ou concluir OS ainda exige conexão — fila de escrita com sincronização
// depois é um projeto à parte, bem maior (as Server Actions são POST, e
// haveria conflito de edição pra resolver).

const VERSAO = "v2"
const CACHE_SHELL = `servicoos-shell-${VERSAO}`
const CACHE_PAGINAS = `servicoos-paginas-${VERSAO}`
const CACHE_ESTATICOS = `servicoos-estaticos-${VERSAO}`
const CACHES_ATUAIS = [CACHE_SHELL, CACHE_PAGINAS, CACHE_ESTATICOS]

const PAGINA_OFFLINE = "/offline"

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
      for (const url of [PAGINA_OFFLINE, "/icon-192.png", "/icon-512.png", "/manifest.json"]) {
        try {
          await cache.add(new Request(url, { cache: "reload" }))
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

async function navegacao(req) {
  try {
    return await redePrimeiro(req, CACHE_PAGINAS)
  } catch {
    // Nem rede nem cópia guardada desta página: explica o que houve em vez de
    // entregar a tela de dinossauro do navegador.
    const offline = await caches.match(PAGINA_OFFLINE)
    return offline ?? new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request

  // Server Actions e envios de formulário são POST. Nunca interceptar: uma
  // escrita respondida pelo cache seria pior que um erro de rede honesto.
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (NUNCA_CACHEAR.some((p) => url.pathname.startsWith(p))) return

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
      vibrate: [200, 100, 200],
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
