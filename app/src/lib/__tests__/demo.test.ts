import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ehSegmento,
  emDinheiro,
  ordemDoDetalhe,
  painelDe,
  SEGMENTOS,
  SEGMENTO_PADRAO,
  segmentoPorSlug,
  totalDaOs,
  type Segmento,
} from "@/lib/demo"

// A demo é uma rota PÚBLICA, sem login, dentro do mesmo aplicativo que guarda a
// carteira de clientes das empresas que pagam.
//
// A única garantia que vale contra isso virar uma porta anônima para dados
// reais é ESTRUTURAL: a árvore da rota não importa o banco. Filtro se esquece,
// permissão se inverte; um import que não existe não vaza nada.

const RAIZ = process.cwd()

/** Os arquivos que as rotas da demo carregam, e tudo que importarem de "@/". */
function arvoreDaDemo(): string[] {
  const vistos = new Set<string>()
  const fila = [
    "src/app/demo/page.tsx",
    "src/app/demo/[ramo]/page.tsx",
    "src/components/demo/moldura.tsx",
    "src/components/demo/visita.tsx",
    "src/lib/demo.ts",
  ]

  while (fila.length) {
    const rel = fila.pop()!
    if (vistos.has(rel)) continue
    const abs = join(RAIZ, rel)
    if (!existsSync(abs)) continue
    vistos.add(rel)

    const fonte = readFileSync(abs, "utf8")
    for (const [, alvo] of fonte.matchAll(/from\s+"(@\/[^"]+)"/g)) {
      const base = "src/" + alvo.slice(2)
      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (existsSync(join(RAIZ, base + ext))) {
          fila.push(base + ext)
          break
        }
      }
    }
  }
  return [...vistos]
}

/**
 * Tira comentários antes de procurar.
 *
 * A primeira versão deste teste acusou `app/demo/page.tsx` de alcançar a
 * sessão — porque o comentário do arquivo EXPLICA que ele "não chama
 * getTenant". Buscar em prosa dá falso positivo, e um teste que acusa sem
 * motivo é um teste que alguém desliga.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

describe("a demo não tem caminho até o banco", () => {
  const PROIBIDOS = [
    { padrao: /from\s+"@\/lib\/prisma"/, nome: "@/lib/prisma" },
    { padrao: /from\s+"@\/generated\/prisma/, nome: "o cliente do Prisma" },
    { padrao: /from\s+"@\/actions\//, nome: "uma Server Action" },
    { padrao: /getTenant|requireActiveSubscription|getLimites/, nome: "a sessão do tenant" },
    { padrao: /"use server"/, nome: 'a diretiva "use server"' },
  ]

  it("nenhum arquivo da árvore importa banco, sessão ou action", () => {
    const problemas: string[] = []
    for (const rel of arvoreDaDemo()) {
      const fonte = semComentarios(readFileSync(join(RAIZ, rel), "utf8"))
      for (const p of PROIBIDOS) {
        if (p.padrao.test(fonte)) problemas.push(`${rel} alcança ${p.nome}`)
      }
    }
    expect(problemas).toEqual([])
  })

  it("a árvore foi realmente percorrida", () => {
    // Guarda contra o teste acima passar por não ter lido arquivo nenhum —
    // um caminho errado deixaria a lista vazia e o teste verde para sempre.
    const arvore = arvoreDaDemo()
    expect(arvore).toContain("src/lib/demo.ts")
    expect(arvore).toContain("src/components/demo/visita.tsx")
    expect(arvore).toContain("src/app/demo/[ramo]/page.tsx")
    expect(arvore.length).toBeGreaterThanOrEqual(5)
  })

  it("as rotas por RAMO também são públicas no proxy", () => {
    // Com igualdade (`=== "/demo"`), só o endereço curto seria público e todo
    // link por ramo cairia no login — quebrando exatamente os links feitos
    // para mandar no WhatsApp.
    const proxy = readFileSync(join(RAIZ, "src/proxy.ts"), "utf8")
    expect(proxy).toContain('pathname.startsWith("/demo")')
  })
})

describe("os endereços", () => {
  it("todo slug serve como URL, e não se repete", () => {
    const vistos = new Set<string>()
    for (const s of SEGMENTOS) {
      expect(s.slug, s.empresa).toMatch(/^[a-z0-9-]+$/)
      expect(vistos.has(s.slug), `slug repetido: ${s.slug}`).toBe(false)
      vistos.add(s.slug)
    }
  })

  it("o ramo padrão existe e é o primeiro da lista", () => {
    // A tela liga o primeiro ramo a `/demo` (sem sufixo). Se o padrão fosse
    // outro, o primeiro botão apontaria para a página errada.
    expect(ehSegmento(SEGMENTO_PADRAO)).toBe(true)
    expect(SEGMENTOS[0].slug).toBe(SEGMENTO_PADRAO)
  })

  it("slug desconhecido cai no padrão, e não quebra", () => {
    expect(segmentoPorSlug("nao-existe").slug).toBe(SEGMENTO_PADRAO)
    expect(segmentoPorSlug(undefined).slug).toBe(SEGMENTO_PADRAO)
    expect(ehSegmento("nao-existe")).toBe(false)
  })

  it("todo ramo tem nome nos dois idiomas", () => {
    // Sem a chave, next-intl lança na renderização e a página do ramo fica
    // fora do ar — justamente a que estava sendo divulgada.
    for (const idioma of ["pt", "en"]) {
      const m = JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8"))
      for (const s of SEGMENTOS) {
        expect(typeof m.demo.ramos?.[s.slug], `${idioma}/${s.slug}`).toBe("string")
      }
    }
  })
})

describe.each(SEGMENTOS.map((s) => [s.slug, s] as const))("%s: os dados fecham", (_slug, s: Segmento) => {
  // Dono de empresa confere soma. Uma demo em que "a receber" não bate com a
  // lista é a primeira coisa que ele nota — e a última em que ele confia.
  //
  // Os totais do painel são CALCULADOS (painelDe), então o que se testa aqui é
  // que os dados autorais são coerentes e que a derivação continua fazendo o
  // que promete.

  it("o detalhe abre uma OS que está na lista", () => {
    // `ordemDoDetalhe` lança quando não está — este teste é o que transforma
    // isso em erro na hora de rodar os testes, e não na tela do visitante.
    expect(() => ordemDoDetalhe(s)).not.toThrow()
    expect(ordemDoDetalhe(s).numero).toBe(s.osAberta.numero)
  })

  it("o valor da OS na lista é a soma dos itens do detalhe", () => {
    // Se discordarem, a lista diz um preço e o detalhe outro — para quem está
    // avaliando o produto, isso lê como sistema que perde informação.
    expect(ordemDoDetalhe(s).valor).toBe(totalDaOs(s.osAberta))
  })

  it("o painel derivado bate com as listas", () => {
    const p = painelDe(s)
    expect(p.aReceber).toBe(s.receber.filter((c) => !c.pago).reduce((t, c) => t + c.valor, 0))
    expect(p.vencido).toBe(s.receber.filter((c) => c.vencida).reduce((t, c) => t + c.valor, 0))
    expect(p.osAbertas).toBe(
      s.ordens.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS").length
    )
  })

  it("toda conta vencida está em aberto", () => {
    // "Vencida e paga" é contradição, e faria o total de vencido incluir
    // dinheiro que já entrou.
    expect(s.receber.filter((c) => c.vencida && c.pago)).toEqual([])
  })

  it("o gráfico termina no mês que o painel mostra", () => {
    const ultimo = s.faturamentoMeses[s.faturamentoMeses.length - 1]
    expect(ultimo.valor).toBe(s.faturadoMes)
  })

  it("tem cinco meses e cinco dias de agenda", () => {
    expect(s.faturamentoMeses).toHaveLength(5)
    expect(s.agenda).toHaveLength(5)
    expect(s.agenda.flat().length).toBeGreaterThanOrEqual(5)
  })

  it("todo status da agenda também aparece na lista de OS", () => {
    // Um status na agenda que a lista não usa denunciaria dados montados
    // separadamente — e é assim que a semana passa a mostrar serviço que não
    // existe em lugar nenhum.
    const daLista = new Set(s.ordens.map((o) => o.status))
    for (const dia of s.agenda) {
      for (const os of dia) {
        if (s.ordens.some((o) => o.numero === os.numero)) {
          expect(daLista.has(os.status)).toBe(true)
        }
      }
    }
  })

  it("o ticket médio é plausível", () => {
    const p = painelDe(s)
    expect(p.ticketMedio).toBeGreaterThan(0)
    expect(p.ticketMedio).toBe(Math.round(s.faturadoMes / s.osConcluidasMes))
  })

  it("a empresa tem nome e os serviços têm preço", () => {
    expect(s.empresa.length).toBeGreaterThan(3)
    expect(s.ordens.length).toBeGreaterThanOrEqual(4)
    for (const o of s.ordens) expect(o.valor, o.titulo).toBeGreaterThan(0)
  })

  it("o checklist tem passos feitos E por fazer", () => {
    // Um checklist todo marcado, ou todo vazio, não mostra o que o recurso
    // faz. O meio do caminho é o que conta a história do técnico em campo.
    const feitos = s.osAberta.checklist.filter((c) => c.feito).length
    expect(feitos).toBeGreaterThan(0)
    expect(feitos).toBeLessThan(s.osAberta.checklist.length)
  })
})

describe("o dinheiro é formatado no idioma de quem lê", () => {
  it("português usa ponto de milhar e vírgula decimal", () => {
    expect(emDinheiro(18740, "pt")).toContain("18.740,00")
  })

  it("inglês usa vírgula de milhar e ponto decimal", () => {
    // A primeira versão guardava "18.740,00" como STRING, então a página em
    // inglês mostrava a pontuação brasileira. Com número + Intl, cada idioma
    // recebe a sua — e a moeda continua sendo real, porque a empresa é
    // brasileira.
    const en = emDinheiro(18740, "en")
    expect(en).toContain("18,740.00")
    expect(en).toContain("R$")
  })
})

describe("nada aqui pertence a alguém de verdade", () => {
  it("não há e-mail, CPF, CNPJ nem telefone nos dados da demo", () => {
    // O motivo de as empresas serem inventadas: print de conta real vaza nome,
    // telefone e endereço de cliente final de uma empresa que não autorizou
    // virar material de venda.
    const fonte = readFileSync(join(RAIZ, "src/lib/demo.ts"), "utf8")
    const suspeitos: string[] = []
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(fonte)) suspeitos.push("e-mail")
    if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte)) suspeitos.push("CPF")
    if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(fonte)) suspeitos.push("CNPJ")
    if (/\(\d{2}\)\s?9?\d{4}-\d{4}/.test(fonte)) suspeitos.push("telefone")
    expect(suspeitos).toEqual([])
  })
})
