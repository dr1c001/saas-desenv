import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AGENDA, ORDENS, OS_ABERTA, PAINEL, RECEBER } from "@/lib/demo"

// A demo é uma rota PÚBLICA, sem login, dentro do mesmo aplicativo que guarda a
// carteira de clientes das empresas que pagam.
//
// A única garantia que vale contra isso virar uma porta anônima para dados
// reais é ESTRUTURAL: a árvore da rota não importa o banco. Filtro se esquece,
// permissão se inverte; um import que não existe não vaza nada.
//
// Este teste percorre os arquivos da demo e falha se qualquer um deles — direta
// ou indiretamente — chegar ao Prisma, à sessão ou às Server Actions.

const RAIZ = process.cwd()

/** Os arquivos que a rota /demo carrega, e tudo que eles importarem de "@/". */
function arvoreDaDemo(): string[] {
  const vistos = new Set<string>()
  const fila = [
    "src/app/demo/page.tsx",
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
      // "@/lib/x" -> "src/lib/x", tentando as extensões que o projeto usa.
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
    expect(arvore.length).toBeGreaterThanOrEqual(3)
  })

  it("a rota está na lista de públicas do proxy", () => {
    // Sem isto o middleware manda para /login e o link, que é a razão de a
    // demo existir, não leva a lugar nenhum.
    const proxy = readFileSync(join(RAIZ, "src/proxy.ts"), "utf8")
    expect(proxy).toContain('pathname === "/demo"')
  })
})

describe("os dados fecham", () => {
  // Dono de empresa confere soma. Uma demo em que "a receber" não bate com a
  // lista é a primeira coisa que ele nota — e a última em que ele confia.

  const emNumero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."))

  it("o total a receber é a soma do que não foi pago", () => {
    const soma = RECEBER.filter((r) => !r.pago).reduce((t, r) => t + emNumero(r.valor), 0)
    expect(soma).toBeCloseTo(emNumero(PAINEL.aReceber), 2)
  })

  it("o vencido é a soma do que está atrasado", () => {
    const soma = RECEBER.filter((r) => r.vencida).reduce((t, r) => t + emNumero(r.valor), 0)
    expect(soma).toBeCloseTo(emNumero(PAINEL.vencido), 2)
  })

  it("o total da OS é a soma dos itens", () => {
    const soma = OS_ABERTA.itens.reduce((t, i) => t + emNumero(i.total), 0)
    expect(soma).toBeCloseTo(emNumero(OS_ABERTA.total), 2)
  })

  it("a OS aberta é uma das da lista, com os mesmos dados", () => {
    // Trocar o valor num lugar e não no outro faria a lista dizer R$ 780 e o
    // detalhe dizer outra coisa — para quem está avaliando o produto, isso lê
    // como sistema que perde informação.
    const naLista = ORDENS.find((o) => o.numero === OS_ABERTA.numero)
    expect(naLista).toBeDefined()
    expect(naLista!.titulo).toBe(OS_ABERTA.titulo)
    expect(naLista!.cliente).toBe(OS_ABERTA.cliente)
    expect(naLista!.tecnico).toBe(OS_ABERTA.tecnico)
    expect(naLista!.valor).toBe(OS_ABERTA.total)
    expect(naLista!.status).toBe(OS_ABERTA.status)
  })

  it("o painel conta as OS realmente em aberto", () => {
    const abertas = ORDENS.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS").length
    expect(PAINEL.osAbertas).toBe(abertas)
  })

  it("a agenda tem cinco dias e nenhum vazio demais", () => {
    expect(AGENDA).toHaveLength(5)
    expect(AGENDA.flat().length).toBeGreaterThanOrEqual(5)
  })
})

describe("nada aqui pertence a alguém de verdade", () => {
  it("não há e-mail, CPF, CNPJ nem telefone nos dados da demo", () => {
    // O motivo de a empresa ser inventada: print de conta real vaza nome,
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
