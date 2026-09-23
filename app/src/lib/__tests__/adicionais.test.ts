import { describe, expect, it } from "vitest"
import { ADICIONAIS } from "@/lib/recursos"
import {
  adicionaisAVenda,
  CATALOGO_DE_ADICIONAIS,
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
  // Pelo MESMO caminho que a tela percorre: `adicionaisAVenda()` e o campo
  // `precoMensal` do item. Estes testes exercitavam `precoDoAdicional`, uma
  // função exportada que nenhuma tela chamava — provavam um caminho que não
  // roda em produção, e mantinham viva uma armadilha (ela devolvia `null`
  // tanto para "sob consulta" quanto para "recurso que não existe", duas
  // coisas que a tela precisa distinguir).
  // (Achado na auditoria de 13/09/2026, grupo 9.)
  const doCatalogo = (recurso: string) =>
    adicionaisAVenda().find((a) => a.recurso === recurso)

  it("filiais tem preço, e ele é menor que o salto de plano", () => {
    // A razão de existir do adicional: sem ele, quem tem duas unidades pularia
    // de R$ 97 para R$ 397. Um adicional que custasse perto de R$ 300 não
    // resolveria nada.
    const p = doCatalogo("filiais")?.precoMensal
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
    expect(doCatalogo("ia")?.precoMensal).toBeNull()
  })

  it("`null` significa sob consulta, e nunca de graça", () => {
    // A distinção que a tela precisa fazer. Se `null` virasse "R$ 0,00" em
    // algum lugar, o sistema estaria anunciando de graça o que custa por uso.
    for (const a of CATALOGO_DE_ADICIONAIS) {
      expect(a.precoMensal === null || a.precoMensal > 0, a.recurso).toBe(true)
    }
  })

  it("recurso desconhecido não está à venda", () => {
    // Pela tela, "não existe" e "sob consulta" são coisas diferentes: o item
    // simplesmente não aparece no catálogo, em vez de aparecer sem preço.
    expect(doCatalogo("nao-existe")).toBeUndefined()
  })
})
