import { describe, expect, it } from "vitest"
import { DESTINOS } from "@/lib/codigos-abas"
import {
  ancoraDoCodigo,
  codigosExplicados,
  MANUAL,
  pedacos,
  todosOsVerbetes,
} from "@/lib/manual"

// O manual é conteúdo, e conteúdo envelhece sem avisar. Estes testes existem
// para que ele NÃO possa envelhecer em silêncio: uma tela nova sem explicação,
// ou um verbete descrevendo uma tela que já não existe, quebram o build em vez
// de virarem uma ajuda que ensina errado com cara de autoridade.

describe("o manual cobre o sistema", () => {
  it("toda tela do catálogo tem um verbete", () => {
    const explicados = new Set(codigosExplicados())
    const semAjuda = DESTINOS.filter((d) => !explicados.has(d.codigo)).map(
      (d) => `${d.codigo} ${d.rota}`
    )
    expect(semAjuda).toEqual([])
  })

  it("nenhum verbete descreve uma tela que não existe", () => {
    // O outro lado: renumerar uma aba e esquecer o manual deixaria um verbete
    // órfão, alcançável só por quem digitasse a âncora à mão.
    const reais = new Set(DESTINOS.map((d) => d.codigo))
    const orfaos = codigosExplicados().filter((c) => !reais.has(c))
    expect(orfaos).toEqual([])
  })

  it("não explica a mesma tela duas vezes", () => {
    const codigos = codigosExplicados()
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it("toda âncora é única", () => {
    // Âncora repetida faz o botão de ajuda rolar para o verbete errado.
    const ids = todosOsVerbetes().map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("todo verbete tem título, resumo e ao menos um bloco", () => {
    for (const v of todosOsVerbetes()) {
      expect(v.titulo.length, v.id).toBeGreaterThan(2)
      expect(v.resumo.length, v.id).toBeGreaterThan(20)
      expect(v.blocos.length, v.id).toBeGreaterThan(0)
    }
  })

  it("nenhum bloco vem vazio", () => {
    for (const v of todosOsVerbetes()) {
      for (const b of v.blocos) {
        if (b.tipo === "lista" || b.tipo === "passos") {
          expect(b.itens.length, `${v.id}/${b.tipo}`).toBeGreaterThan(0)
        }
        if (b.tipo === "tabela") {
          expect(b.linhas.length, `${v.id}/tabela`).toBeGreaterThan(0)
          // Linha com número de células diferente do cabeçalho desalinha a
          // tabela inteira na tela.
          for (const l of b.linhas) expect(l.length, `${v.id}/tabela`).toBe(b.cabecalho.length)
        }
        if (b.tipo === "fluxo") expect(b.etapas.length, `${v.id}/fluxo`).toBeGreaterThan(1)
      }
    }
  })

  it("todo grupo de abas do catálogo aparece como seção", () => {
    const gruposReais = new Set(DESTINOS.map((d) => d.codigo.split(".")[0]))
    const gruposNoManual = new Set(MANUAL.map((s) => s.numero).filter(Boolean))
    expect([...gruposReais].filter((g) => !gruposNoManual.has(g))).toEqual([])
  })
})

describe("a âncora do código", () => {
  it("troca ponto por traço", () => {
    // Ponto em href funciona, mas atrapalha quem copia o endereço.
    expect(ancoraDoCodigo("5.4.1")).toBe("5-4-1")
    expect(ancoraDoCodigo("1.1")).toBe("1-1")
  })
})

describe("o negrito do texto", () => {
  it("separa o trecho marcado", () => {
    expect(pedacos("o *saldo* muda")).toEqual([
      { forte: false, texto: "o " },
      { forte: true, texto: "saldo" },
      { forte: false, texto: " muda" },
    ])
  })

  it("texto sem marca sai inteiro", () => {
    expect(pedacos("nada aqui")).toEqual([{ forte: false, texto: "nada aqui" }])
  })

  it("asterisco solto não vira negrito", () => {
    // Senão um "*" no meio de uma frase engoliria o resto do parágrafo.
    expect(pedacos("2 * 3 = 6")).toEqual([{ forte: false, texto: "2 * 3 = 6" }])
  })

  it("não deixa pedaço vazio", () => {
    expect(pedacos("*tudo*")).toEqual([{ forte: true, texto: "tudo" }])
  })
})
