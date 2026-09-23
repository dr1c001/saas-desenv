import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { estrategiaPara, NUNCA_CACHEAR, paginaOfflineDe } from "@/lib/sw-estrategia"

describe("as duas cópias da lista", () => {
  it("a de public/sw.js é IGUAL à daqui", () => {
    // `public/sw.js` é servido cru e não pode importar de `src/`, então a lista
    // existe duas vezes. Este teste é o que impede as cópias de desandarem —
    // sem ele, alguém acrescenta uma rota protegida num arquivo só e o outro
    // continua guardando aquela tela em disco, calado.
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
    const linha = sw.split("\n").find((l) => l.includes("const NUNCA_CACHEAR ="))
    expect(linha, "a linha NUNCA_CACHEAR sumiu do sw.js").toBeTruthy()

    const doSw: string[] = JSON.parse(linha!.slice(linha!.indexOf("[")).replace(/'/g, '"'))
    expect(doSw).toEqual([...NUNCA_CACHEAR])
  })

  it("o sw.js subiu a VERSÃO", () => {
    // O próprio arquivo avisa: sem subir, o navegador segue com o service
    // worker antigo em cache e as mudanças são ignoradas em silêncio. Este
    // teste não sabe qual é a versão certa — sabe que ela não pode ser a v3,
    // que é a que existia antes do painel abrir offline.
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
    expect(sw).toMatch(/const VERSAO = "v[4-9]\d*"/)
  })
})

describe("o painel: não guardar é diferente de não abrir", () => {
  it("navegar para /admin vai à rede e NÃO guarda", () => {
    // O conserto que a janela instalada exigia. Antes era um `return` cru: o
    // service worker se afastava, e sem barra de endereço nem botão de
    // recarregar, a tela de dinossauro parece o aplicativo morto.
    expect(estrategiaPara({ pathname: "/admin", mode: "navigate" })).toBe("rede-sem-guardar")
    expect(estrategiaPara({ pathname: "/admin/duvidas", mode: "navigate" })).toBe("rede-sem-guardar")
  })

  it("o resto do painel continua INTOCADO pelo cache", () => {
    // A decisão que não muda: o painel mostra o estado de AGORA do negócio, e
    // um MRR de ontem ali é pior que painel nenhum.
    expect(estrategiaPara({ pathname: "/admin", destination: "script" })).toBe("ignorar")
    expect(estrategiaPara({ pathname: "/api/cron/daily", mode: "navigate" })).toBe(
      "rede-sem-guardar"
    )
    expect(estrategiaPara({ pathname: "/api/nfse", destination: "script" })).toBe("ignorar")
  })

  it("as telas de login também", () => {
    expect(estrategiaPara({ pathname: "/login", mode: "navigate" })).toBe("rede-sem-guardar")
    expect(estrategiaPara({ pathname: "/reset-password", mode: "navigate" })).toBe(
      "rede-sem-guardar"
    )
  })
})

describe("o resto do sistema, como sempre foi", () => {
  it("página comum guarda e serve offline", () => {
    expect(estrategiaPara({ pathname: "/service-orders", mode: "navigate" })).toBe("navegacao")
  })

  it("estático do Next é cache primeiro", () => {
    expect(estrategiaPara({ pathname: "/_next/static/chunks/abc.js" })).toBe("cache-primeiro")
  })

  it("imagem, fonte, estilo e script também", () => {
    for (const d of ["image", "font", "style", "script"]) {
      expect(estrategiaPara({ pathname: "/qualquer", destination: d }), d).toBe("cache-primeiro")
    }
  })
})

describe("o que o service worker nunca toca", () => {
  it("escrita passa direto", () => {
    // Uma Server Action respondida por cópia guardada seria pior que um erro de
    // rede honesto.
    expect(estrategiaPara({ pathname: "/service-orders", mode: "navigate", ehEscrita: true })).toBe(
      "ignorar"
    )
  })

  it("outro domínio passa direto", () => {
    expect(estrategiaPara({ pathname: "/x", mode: "navigate", ehExterno: true })).toBe("ignorar")
  })

  it("payload de navegação do App Router passa direto", () => {
    // A mesma URL devolve conteúdo diferente conforme os cabeçalhos de
    // roteamento, então guardar por URL serviria a resposta errada.
    expect(estrategiaPara({ pathname: "/clients", mode: "navigate", temRsc: true })).toBe("ignorar")
  })
})

describe("qual página offline responde", () => {
  it("o painel tem a dele", () => {
    // O texto do /offline é do técnico e promete o que o painel não faz:
    // "concluir e mudar status funcionam sem sinal". O dono lendo isso no
    // painel ficaria procurando uma fila de sincronização que não existe.
    expect(paginaOfflineDe("/admin")).toBe("/offline/admin")
    expect(paginaOfflineDe("/admin/duvidas/abc")).toBe("/offline/admin")
  })

  it("o resto do sistema usa a do técnico", () => {
    expect(paginaOfflineDe("/service-orders")).toBe("/offline")
    expect(paginaOfflineDe("/")).toBe("/offline")
  })
})
