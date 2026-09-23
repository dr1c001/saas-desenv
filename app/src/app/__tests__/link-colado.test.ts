import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import sitemap from "@/app/sitemap"
import { SEGMENTOS, SEGMENTO_PADRAO } from "@/lib/demo"

// O que sai quando alguém cola o link.
//
// Cinco defeitos da mesma família, todos nas páginas feitas para SEREM
// COMPARTILHADAS:
//
//   1. a landing não tinha cartão de OpenGraph: servicoos.com.br colado no
//      WhatsApp saía como retângulo de texto sem figura;
//   2. a descrição do site ainda vendia o posicionamento horizontal recolhido
//      em 08/09/2026 — "CRM, OS, Financeiro e Dashboard", jargão de módulo;
//   3. o cartão da demo tinha o prefixo e as quatro pastilhas FIXOS em
//      português, enquanto manchete e chamada vinham do i18n: em inglês, saía
//      em duas línguas;
//   4. /demo e /demo/[ramo] tinham título fixo em português (e o de ramo
//      concatenava a preposição "para" com um nome traduzido), e /status era a
//      única pública com metadata fixa;
//   5. o sitemap listava três URLs e deixava a demo inteira de fora, enquanto
//      o robots.txt envelheceu dez rotas atrás das abas que existem.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")
const APP = join(RAIZ, "src/app")

/**
 * A fonte SEM comentário.
 *
 * Necessário, e não zelo: os comentários que explicam cada defeito CITAM a
 * frase defeituosa de propósito — "O sistema para", o template com a
 * preposição fixa —, e um `not.toContain` sobre o arquivo inteiro fica
 * vermelho contra a própria correção. Aconteceu três vezes nesta auditoria
 * antes de virar helper.
 */
const codigoDe = (p: string) =>
  ler(p)
    .split("\n")
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
    })
    .join("\n")

const mensagens = (idioma: "pt" | "en") =>
  JSON.parse(ler(`messages/${idioma}.json`)) as {
    landing: { meta: { title: string; description: string }; og: { manchete: string; chamada: string } }
    demo: { ogPrefixo: string; ogModulos: string[]; metaTitulo: string; metaCurta: { titulo: string; descricao: string } }
    status: { metaTitulo: string; metaDescricao: string }
  }

describe("a landing tem cartão de compartilhamento", () => {
  it("o arquivo existe e usa o cartão que já era legível em miniatura", () => {
    expect(existsSync(join(APP, "opengraph-image.tsx"))).toBe(true)
    expect(ler("src/app/opengraph-image.tsx")).toContain("cartaoOg")
  })

  it("e o proxy DEIXA o scraper chegar nele", () => {
    // Bloqueante, e invisível em teste de unidade: `/opengraph-image` não tem
    // extensão, e o matcher do proxy só isenta caminho COM ponto. Sem esta
    // linha o scraper do WhatsApp recebe 307 para /login e o cartão continua
    // não aparecendo — o defeito inteiro, de volta, com o arquivo criado.
    // Os cartões da demo só escapam porque `startsWith("/demo")` os cobre.
    const proxy = ler("src/proxy.ts")
    expect(proxy).toContain('request.nextUrl.pathname === "/opengraph-image"')
  })

  it("o cartão do Twitter comporta figura grande", () => {
    // `summary` renderiza miniatura ao lado do texto; o cartão é 1200×630.
    expect(ler("src/app/layout.tsx")).toContain('card: "summary_large_image"')
  })
})

describe("nenhum texto de compartilhamento ficou fixo no código", () => {
  it("a descrição do site vem do i18n, e não vende mais jargão de módulo", () => {
    const layout = ler("src/app/layout.tsx")
    expect(layout).toContain('getTranslations("landing.meta")')
    expect(layout).not.toContain("CRM, OS, Financeiro e Dashboard")
    for (const idioma of ["pt", "en"] as const) {
      expect(mensagens(idioma).landing.meta.description, idioma).not.toMatch(/\bCRM\b|\bDashboard\b/)
    }
  })

  it("o cartão da demo não tem mais português cravado", () => {
    const codigo = codigoDe("src/components/demo/cartao-og.tsx")
    expect(codigo).not.toContain("O sistema para")
    expect(codigo).not.toContain("Ordem de serviço")
    expect(codigo).toContain("{prefixo}")
    expect(codigo).toContain("modulos.map")
  })

  it("e os três cartões passam os textos traduzidos", () => {
    for (const p of [
      "src/app/opengraph-image.tsx",
      "src/app/demo/opengraph-image.tsx",
      "src/app/demo/[ramo]/opengraph-image.tsx",
    ]) {
      expect(ler(p), p).toContain("ogPrefixo")
      expect(ler(p), p).toContain("ogModulos")
    }
  })

  it("/demo e /status deixaram de ter metadata fixa", () => {
    expect(ler("src/app/demo/page.tsx")).toContain("export async function generateMetadata")
    expect(ler("src/app/status/page.tsx")).toContain("export async function generateMetadata")
    // A hora segue o idioma de quem lê; o fuso continua São Paulo.
    expect(ler("src/app/status/page.tsx")).toContain('locale === "en" ? "en-US" : "pt-BR"')
  })

  it("e o título por ramo não concatena mais a preposição", () => {
    const fonte = codigoDe("src/app/demo/[ramo]/page.tsx")
    expect(fonte).not.toMatch(/`Serviç?oOS para \$\{/)
    expect(fonte).toContain('t("metaTitulo", { ramo: nome })')
  })

  it.each(["pt", "en"] as const)("com as chaves nos dois idiomas — %s", (idioma) => {
    const m = mensagens(idioma)
    expect(typeof m.landing.meta.title).toBe("string")
    expect(typeof m.landing.og.manchete).toBe("string")
    expect(typeof m.demo.ogPrefixo).toBe("string")
    expect(typeof m.demo.metaTitulo).toBe("string")
    expect(typeof m.demo.metaCurta.titulo).toBe("string")
    expect(typeof m.status.metaTitulo).toBe("string")
  })

  it("e as pastilhas têm o MESMO número nos dois idiomas", () => {
    // Uma lista com um item a mais num idioma faz o cartão sair com layout
    // diferente conforme quem compartilha.
    expect(mensagens("en").demo.ogModulos.length).toBe(mensagens("pt").demo.ogModulos.length)
    expect(mensagens("pt").demo.ogModulos.length).toBe(4)
  })
})

describe("o sitemap declara o que existe", () => {
  const urls = sitemap().map((e) => new URL(e.url).pathname)

  it("a demo e as páginas por ramo entraram", () => {
    expect(urls).toContain("/demo")
    for (const s of SEGMENTOS.filter((s) => s.slug !== SEGMENTO_PADRAO)) {
      expect(urls, s.slug).toContain(`/demo/${s.slug}`)
    }
  })

  it("o ramo PADRÃO não entra duas vezes", () => {
    // /demo já é a página do ramo padrão: publicar as duas é conteúdo duplicado.
    expect(urls).not.toContain(`/demo/${SEGMENTO_PADRAO}`)
  })

  it("/status fica de fora — ela é noindex", () => {
    // Sitemap com noindex é contradição: manda o Google buscar o que ela mesma
    // manda não indexar.
    expect(urls).not.toContain("/status")
    expect(ler("src/app/status/page.tsx")).toContain("robots: { index: false }")
  })

  it("TODA url do sitemap resolve para uma página que existe", () => {
    // Com fallback para o segmento dinâmico: /demo/refrigeracao não tem
    // arquivo próprio — a página é demo/[ramo]/page.tsx. Sem o fallback, um
    // teste ingênuo pularia metade das URLs e não veria nada.
    const resolveu = (caminho: string) => {
      if (caminho === "/") return existsSync(join(APP, "page.tsx"))
      const direto = join(APP, caminho.slice(1), "page.tsx")
      if (existsSync(direto)) return true
      const partes = caminho.slice(1).split("/")
      const dinamico = join(APP, ...partes.slice(0, -1), "[ramo]", "page.tsx")
      return existsSync(dinamico)
    }
    const perdidas = urls.filter((u) => !resolveu(u))
    expect(perdidas, `url no sitemap sem página: ${perdidas.join(", ")}`).toEqual([])
    // Sentinela: se `resolveu` passasse a devolver true para tudo, o teste
    // acima ficaria verde sem conferir nada.
    expect(resolveu("/rota-que-nao-existe")).toBe(false)
  })
})

describe("o robots.txt não envelhece de novo", () => {
  /** As rotas privadas que existem no disco, de qualquer forma que existam. */
  function rotasPrivadas(): string[] {
    const achadas: string[] = []
    for (const grupo of ["(dashboard)", "(auth)"]) {
      const dir = join(APP, grupo)
      if (!existsSync(dir)) continue
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        if (n.isDirectory()) achadas.push(`/${n.name}`)
      }
    }
    // E as de TOPO, que é a forma que escapou duas vezes: /admin e /expired não
    // moram em grupo nenhum. Ler só os dois grupos deixaria uma rota nova
    // nesse formato ir direto para o Google.
    const PUBLICAS = new Set([
      "(dashboard)", "(auth)", "api", "demo", "terms", "privacy", "status", "offline", "p", "q",
    ])
    for (const n of readdirSync(APP, { withFileTypes: true })) {
      if (!n.isDirectory() || PUBLICAS.has(n.name)) continue
      if (existsSync(join(APP, n.name, "page.tsx"))) achadas.push(`/${n.name}`)
    }
    return [...new Set(achadas)].sort()
  }

  it("toda rota privada está no disallow", () => {
    const fonte = ler("src/app/robots.ts")
    const esquecidas = rotasPrivadas().filter((r) => !fonte.includes(`"${r}"`))
    expect(
      esquecidas,
      `Estas rotas existem e NÃO estão no disallow — o crawler gasta orçamento ` +
        `nelas e elas podem aparecer na busca: ${esquecidas.join(", ")}`
    ).toEqual([])
  })

  it("e a varredura acha as rotas de topo, não só as dos grupos", () => {
    // Âncora: se `rotasPrivadas` olhasse só os grupos, /admin sumiria da lista
    // e o teste acima passaria sem cobrir a forma que já falhou.
    expect(rotasPrivadas()).toContain("/admin")
    expect(rotasPrivadas()).toContain("/expired")
    expect(rotasPrivadas()).toContain("/criar-senha")
  })
})
