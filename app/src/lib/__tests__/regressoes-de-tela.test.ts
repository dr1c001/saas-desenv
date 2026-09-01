import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Dois defeitos relatados pelo dono em 01/09/2026. Nenhum dos dois aparece em
// erro de tipo, de lint ou de build — e nenhum dos dois aparece no computador,
// que é onde o desenvolvimento acontece. São exatamente a classe de coisa que
// volta em silêncio quando alguém "arruma" o CSS meses depois.

const RAIZ = process.cwd()
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8")

describe("o menu não pode sair da tela nas páginas com tabela larga", () => {
  // O relato: "com a aba histórico e/ou recibo aberta, não dá para clicar no
  // menu de novo".
  //
  // A causa não era o menu. `SidebarProvider` é um flex em linha, e o `<main>`
  // é um item flex — que nasce com `min-width: auto` e por isso NÃO encolhe
  // abaixo da largura do próprio conteúdo. A tabela de 9 colunas do Histórico
  // esticava o `main` para 1223px numa tela de 375px (medido no navegador), e
  // o `overflow-x-auto` da tabela nunca entrava em ação porque o `w-full` dele
  // já resolvia contra a largura esticada.
  //
  // Como o cabeçalho vive dentro desse `main`, rolar para o lado para ler a
  // tabela levava o botão do menu para fora da tela.

  it("o main do dashboard tem min-w-0", () => {
    const layout = ler("src/app/(dashboard)/layout.tsx")
    const tagMain = layout.match(/<main className="([^"]*)"/)
    expect(tagMain, "não achei o <main> do layout").not.toBeNull()
    expect(tagMain![1]).toContain("min-w-0")
  })

  it("a tabela continua tendo o próprio contêiner de rolagem", () => {
    // O `min-w-0` só resolve porque a tabela sabe rolar sozinha. Tirar um dos
    // dois traz o defeito de volta pela outra ponta.
    const tabela = ler("src/components/ui/table.tsx")
    expect(tabela).toContain("overflow-x-auto")
  })
})

describe("as fotos aceitam câmera E arquivo", () => {
  // O relato: o técnico precisa anexar a foto do "antes", que muitas vezes já
  // está na galeria. Havia só uma entrada, com `capture="environment"` — que
  // no celular abre a câmera E SÓ. No computador o atributo é ignorado, então
  // o problema existia apenas no aparelho de quem trabalha em campo.

  const fonte = ler("src/components/shared/fotos.tsx")
  const entradas = [...fonte.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0])
  const deArquivo = entradas.filter((e) => e.includes('type="file"'))

  it("existem duas entradas de arquivo", () => {
    expect(deArquivo).toHaveLength(2)
  })

  it("uma abre a câmera direto, a outra não", () => {
    // A da câmera é o gesto certo de quem está no local e fotografa na hora; a
    // sem `capture` é a que deixa escolher da galeria ou do computador. Uma só
    // não atende os dois, porque `capture` não é opcional na hora do clique.
    const comCaptura = deArquivo.filter((e) => e.includes("capture="))
    expect(comCaptura).toHaveLength(1)
    expect(deArquivo.filter((e) => !e.includes("capture="))).toHaveLength(1)
  })

  it("as duas aceitam imagem e várias de uma vez", () => {
    for (const e of deArquivo) {
      expect(e).toContain('accept="image/*"')
      expect(e).toContain("multiple")
      // As duas passam pelo MESMO tratador: a compressão no aparelho e o
      // limite por registro não podem valer só para um dos caminhos.
      expect(e).toContain("onChange={aoEscolher}")
    }
  })

  it("o texto de ajuda explica os dois botões, nos dois idiomas", () => {
    for (const idioma of ["pt", "en"]) {
      const m = JSON.parse(ler(`messages/${idioma}.json`))
      expect(typeof m.fotos.escolherArquivo, `${idioma}/escolherArquivo`).toBe("string")
      expect(typeof m.fotos.hint, `${idioma}/hint`).toBe("string")
    }
  })
})
