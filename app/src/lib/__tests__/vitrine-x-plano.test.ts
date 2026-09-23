import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ADICIONAIS } from "@/lib/recursos"
import { CARDS_DA_VITRINE } from "@/lib/vitrine"
import { planoMinimo, recursosDoPlano } from "@/lib/plan"

// A vitrine tem de prometer o que o plano ENTREGA.
//
// Escrito depois de um defeito que passou por todos os testes e pelo deploy, e
// so apareceu quando o dono olhou a propria tela de planos: `filiais` deixou de
// ser do Enterprise no CODIGO, e o card do Enterprise continuou anunciando
// "Filiais (multiunidade)". Quem assinasse o plano de R$ 397 por causa daquela
// linha nao receberia o recurso.
//
// A causa nao foi descuido pontual: sao DUAS FONTES DE VERDADE que precisam
// concordar e nao tinham nada obrigando isso — a lista de recursos por plano,
// em codigo, e a lista de vantagens por plano, em texto de venda. Um teste que
// le as duas e a unica coisa que as mantem juntas.

const PLANOS = ["starter", "pro", "enterprise"] as const

function mensagens(idioma: "pt" | "en") {
  return JSON.parse(
    readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8")
  ) as {
    planFeatures: Record<string, string[]>
    mapAdmin: { admin: { actions: { featureNames: Record<string, string> } } }
  }
}

/** Sem acento e sem caixa: "Filiais" e "filiais" sao a mesma promessa. */
const simples = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

describe("nenhum plano anuncia o que virou adicional", () => {
  it.each(["pt", "en"] as const)("em %s", (idioma) => {
    const m = mensagens(idioma)
    const nomes = m.mapAdmin.admin.actions.featureNames

    const prometidos: string[] = []
    for (const adicional of ADICIONAIS) {
      const nome = simples(nomes[adicional] ?? adicional)
      // Primeira palavra: "Filiais (multiunidade)" e "Filiais" sao a mesma
      // promessa, e o texto de venda quase sempre acrescenta um parenteses.
      const chave = nome.split(/[\s(]/)[0]
      if (chave.length < 4) continue

      // Palavra INTEIRA, e nao pedaco de palavra. A primeira versao deste
      // teste comparava por substring e acusou "8 tax invoices per month" de
      // anunciar a assistente de voz — porque "invoices" contem "voice".
      // Barra DUPLA de proposito: dentro de template literal, `\b` sozinho
      // e o caractere BACKSPACE, e nao fronteira de palavra. A regex virava
      // "[backspace]filiais" e nunca casava — um teste que passa por nao
      // conseguir falhar, que e pior que teste nenhum.
      const palavraInteira = new RegExp(`\\b${chave}`, "i")

      for (const plano of PLANOS) {
        for (const linha of m.planFeatures[plano] ?? []) {
          if (palavraInteira.test(simples(linha))) {
            prometidos.push(`${plano} anuncia "${linha}", mas ${adicional} é adicional`)
          }
        }
      }
    }

    expect(prometidos).toEqual([])
  })
})

describe("os dois idiomas prometem a mesma coisa", () => {
  it("todo plano tem o mesmo NÚMERO de vantagens em pt e en", () => {
    // Uma lista com um item a mais num idioma significa que alguém atualizou um
    // e esqueceu o outro — e o cliente em inglês vê uma promessa diferente.
    const pt = mensagens("pt").planFeatures
    const en = mensagens("en").planFeatures
    for (const plano of PLANOS) {
      expect(en[plano]?.length, plano).toBe(pt[plano]?.length)
    }
  })
})

describe("o Enterprise continua tendo o que oferecer", () => {
  // Contar itens seria mau critério, e a primeira versão deste teste caiu
  // nisso: o Enterprise tem uma lista MENOR de propósito, porque o primeiro
  // item dela é "Tudo do Pro". O que importa não é quantidade, é ter algo que
  // o Pro não tem.

  it("ainda anuncia a API, que é o exclusivo que sobrou", () => {
    // A trava que importa depois de tirar filiais de lá: se o último exclusivo
    // sair da vitrine também, o plano de R$ 397 passa a não prometer nada que
    // o de R$ 197 não prometa — e isso precisa ser DECISÃO, não erosão.
    const f = mensagens("pt").planFeatures
    expect(f.enterprise.some((l) => simples(l).includes("api"))).toBe(true)
  })

  it("anuncia algo que o Pro NÃO anuncia", () => {
    const f = mensagens("pt").planFeatures
    const doPro = new Set(f.pro.map(simples))
    // "Tudo do Pro" não conta: é a referência, não uma vantagem própria.
    const proprias = f.enterprise.filter((l) => !doPro.has(simples(l)) && !simples(l).startsWith("tudo"))
    expect(proprias.length).toBeGreaterThan(0)
  })
})

// ─── A GRADE da landing, que fica ACIMA da tabela de precos ──────────────────
//
// Os testes acima guardam `planFeatures` — a lista de vantagens do CARD DE
// PRECO. A grade "Tudo que sua empresa precisa" e outra coisa, aparece ANTES na
// pagina, e nunca teve nada guardando: dez cards sem marca de plano nenhuma,
// cinco deles prometendo o que o Starter de R$ 97 nao entrega. Quem le a grade
// decide ali; a tabela de precos, mais abaixo, ja e confirmacao.
// (Achado na auditoria de 13/09/2026, grupo 9.)

type CardDoJson = { title: string; desc: string; pro?: string }
const cards = (idioma: "pt" | "en") =>
  (mensagens(idioma) as unknown as { landing: { features: { items: CardDoJson[] } } })
    .landing.features.items
const selos = (idioma: "pt" | "en") =>
  (mensagens(idioma) as unknown as {
    landing: { features: { planBadge: Record<string, string>; planNote: string } }
  }).landing.features

describe("a grade da landing diz de que plano e cada coisa", () => {
  it("o Starter continua sendo o plano de UM recurso", () => {
    // Ancora. Se o Starter passar a entregar tudo, os testes abaixo ficariam
    // verdes por nao terem mais nada a cobrar — e e melhor falharem alto.
    expect(recursosDoPlano("starter")).toEqual(["nfse"])
  })

  it.each(["pt", "en"] as const)("todo card esta classificado — %s", (idioma) => {
    expect(cards(idioma).length).toBe(CARDS_DA_VITRINE.length)
  })

  it.each(["pt", "en"] as const)("e a classificacao esta no card CERTO — %s", (idioma) => {
    // A lista e 1:1 por POSICAO com o JSON, e posicao e fragil: inserir um card
    // no meio deslocaria todos os selos sem quebrar contagem nenhuma. A ancora
    // prende a posicao ao conteudo.
    cards(idioma).forEach((c, i) => {
      expect(c.title, `card ${i}`).toContain(CARDS_DA_VITRINE[i].ancora[idioma])
    })
  })

  it("todo card que o Starter NAO entrega leva selo", () => {
    const semSelo = CARDS_DA_VITRINE.map((c, i) => ({ i, selo: planoMinimo(c.recursos) }))
      .filter((x) => x.selo !== null && x.selo !== "starter")
    // Mapa GPS e Checklist sao os dois cards inteiramente pagos.
    expect(semSelo.map((x) => x.i)).toEqual([1, 4])
    for (const x of semSelo) expect(x.selo).toBe("pro")
  })

  it("os cinco recursos pagos da grade estao declarados, nominalmente", () => {
    expect(CARDS_DA_VITRINE[0].recursosPro).toContain("signature")
    expect(CARDS_DA_VITRINE[1].recursos).toContain("gpsMap")
    expect(CARDS_DA_VITRINE[4].recursos).toContain("checklist")
    expect(CARDS_DA_VITRINE[5].recursosPro).toContain("advancedReports")
    expect(CARDS_DA_VITRINE[6].recursosPro).toContain("gpsMap")
  })

  it.each(["pt", "en"] as const)("a clausula paga saiu do texto livre — %s", (idioma) => {
    // A REGRESSAO que criou o defeito: devolver a promessa paga para o `desc`,
    // onde ela passa por recurso incluso.
    const proibido: Record<string, RegExp> = idioma === "pt"
      ? { "0": /assinatura digital/i, "5": /desempenho/i, "6": /localiza[cç]/i }
      : { "0": /signature/i, "5": /performance/i, "6": /location/i }
    for (const [i, regex] of Object.entries(proibido)) {
      expect(cards(idioma)[Number(i)].desc, `card ${i}`).not.toMatch(regex)
    }
  })

  it.each(["pt", "en"] as const)("quem tem clausula paga tem a linha, e so esses — %s", (idioma) => {
    cards(idioma).forEach((c, i) => {
      const temPago = CARDS_DA_VITRINE[i].recursosPro.length > 0
      expect(Boolean(c.pro), `card ${i}`).toBe(temPago)
    })
  })

  it.each(["pt", "en"] as const)("todo rotulo de selo existe — %s", (idioma) => {
    // `planoMinimo` pode devolver "adicional" no dia em que um card apontar
    // para `ia` ou `filiais`. Chave faltando = pagina quebrada em producao.
    const f = selos(idioma)
    for (const valor of ["pro", "enterprise", "adicional"]) {
      expect(typeof f.planBadge[valor], valor).toBe("string")
    }
    expect(typeof f.planNote).toBe("string")
  })

  it("e o selo chega mesmo a TELA", () => {
    // Sem isto, o mapeamento poderia estar perfeito no lib e o JSX nao mostrar
    // nada — a landing mentindo igual, com a suite verde.
    const tela = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8")
    expect(tela).toContain("features.planNote")
    // Ancorado nas DUAS pontas: o selo do card tem de VIR de
    // planoMinimo(card.recursos) E ser renderizado. Um `toContain("planoMinimo(")`
    // solto passa mesmo com o selo do card apagado, porque o da clausula
    // continua chamando a mesma funcao — foi o que a mutacao mostrou.
    expect(tela).toMatch(/seloDoCard = planoMinimo\(card\?\.recursos/)
    expect(tela).toMatch(/seloDaClausula = planoMinimo\(card\?\.recursosPro/)
    expect(tela).toMatch(/\{seloDoCard && seloDoCard !== "starter" && <SeloDePlano/)
    expect(tela).toMatch(/seloDaClausula !== "starter" && \(/)
  })
})

describe("a segunda lista de vantagens nao volta", () => {
  // `Plan.features` era uma lista gravada no banco que tela nenhuma lia — e que
  // ja divergia em tres pontos da vitrine de verdade: "Suporte 24h" x
  // "Atendimento por WhatsApp em horario comercial"; o Starter sem "Orcamentos
  // e PDF" nem "Recibos automaticos"; o Pro com "Estoque, compras e
  // fornecedores" que a vitrine nao lista. Nao aparecia porque ninguem lia, e
  // era essa a armadilha.
  const fonte = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("o seed nao grava mais texto de vitrine", () => {
    expect(fonte("prisma/seed.ts")).not.toMatch(/features:\s*\[/)
  })

  it("e nenhuma consulta pede a coluna", () => {
    // Parar de PEDIR vem antes de apagar: enquanto o codigo no ar seleciona a
    // coluna, derruba-la faria a tela de assinatura responder 500 na janela do
    // deploy. `select` explicito nas duas consultas que traziam a tabela
    // inteira.
    // So CODIGO: o comentario que explica a decisao cita `Plan.features` de
    // proposito, e um `not.toMatch` sobre o arquivo inteiro ficaria vermelho
    // contra a correcao.
    const billing = fonte("src/actions/billing.ts")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n")
    expect(billing).toMatch(/findMany\(\{[\s\S]{0,400}?select: \{[\s\S]{0,200}?maxUsers: true/)
    expect(billing).not.toMatch(/features/)
  })
})
