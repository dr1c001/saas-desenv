import { describe, expect, it } from "vitest"
import { ADICIONAIS } from "@/lib/recursos"
import {
  adicionaisAVenda,
  CATALOGO_DE_ADICIONAIS,
  precoDoAdicional,
} from "@/lib/adicionais"

// O catálogo aparece em DOIS lugares: a tela de planos, dentro do sistema, e a
// landing, fora dele. O que estes testes guardam é a coerência entre os dois —
// e entre o que se anuncia e o que existe de verdade.

describe("o catálogo e o que existe no sistema", () => {
  it("todo adicional do sistema está à venda", () => {
    // O defeito que isto evita: transformar um recurso em adicional e ele não
    // aparecer em lugar nenhum para comprar. Fica só concedível à mão, e
    // ninguém descobre que existe.
    const aVenda = new Set(CATALOGO_DE_ADICIONAIS.map((a) => a.recurso))
    expect([...ADICIONAIS].filter((r) => !aVenda.has(r))).toEqual([])
  })

  it("não anuncia adicional que não existe mais", () => {
    // O outro lado: tirar um recurso de ADICIONAIS e continuar vendendo.
    expect(adicionaisAVenda().length).toBe(ADICIONAIS.length)
  })
})

describe("o preço", () => {
  it("filiais tem preço, e ele é menor que o salto de plano", () => {
    // A razão de existir do adicional: sem ele, quem tem duas unidades pularia
    // de R$ 97 para R$ 397. Um adicional que custasse perto de R$ 300 não
    // resolveria nada.
    const p = precoDoAdicional("filiais")
    expect(p).not.toBeNull()
    expect(p!).toBeGreaterThan(0)
    expect(p!).toBeLessThan(300)
  })

  it("a assistente de voz está SOB CONSULTA até o custo ser medido", () => {
    // Ela é o único recurso com custo por uso. Anunciar preço antes de medir o
    // custo dos 500 comandos da franquia é o jeito de descobrir tarde que o
    // cliente que mais usa dá prejuízo.
    //
    // Este teste vai falhar no dia em que o preço for definido — e isso é o
    // ponto: é o lembrete de conferir se o número cobre o custo medido.
    expect(precoDoAdicional("ia")).toBeNull()
  })

  it("`null` significa sob consulta, e nunca de graça", () => {
    // A distinção que a tela precisa fazer. Se `null` virasse "R$ 0,00" em
    // algum lugar, o sistema estaria anunciando de graça o que custa por uso.
    for (const a of CATALOGO_DE_ADICIONAIS) {
      expect(a.precoMensal === null || a.precoMensal > 0, a.recurso).toBe(true)
    }
  })

  it("recurso desconhecido não inventa preço", () => {
    expect(precoDoAdicional("nao-existe")).toBeNull()
  })
})
