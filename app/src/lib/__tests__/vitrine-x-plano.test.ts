import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ADICIONAIS } from "@/lib/recursos"

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
