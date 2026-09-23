import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Escrito depois de um defeito que passou por todos os outros testes, pelo
// lint, pelo build E pelo deploy, e só apareceu com o cliente na tela.
//
// O sharp carrega o binário da plataforma por caminho DINÂMICO
// (`@img/sharp-${plataforma}`). O rastreamento estático do Next não segue
// isso, então a biblioteca nativa não ia junto no pacote da função. No Windows
// do desenvolvedor funcionava; na Vercel morria com "libvips-cpp.so: cannot
// open shared object file".
//
// E morria EM SILÊNCIO: a exceção era pega pelo catch e virava "não consegui
// salvar agora, tente de novo". A pessoa tentou cinco vezes.
//
// A correção é `outputFileTracingIncludes` no next.config.ts, por ROTA. Ou
// seja: usar sharp numa rota nova sem lembrar de listá-la ali reintroduz
// exatamente o mesmo defeito, com exatamente a mesma cara. Este teste é o que
// obriga a lembrar.

const RAIZ = process.cwd()

/** Os arquivos que usam sharp hoje, e a rota de onde são chamados.
 *
 *  Mexer nesta lista é obrigatório ao usar sharp em lugar novo — e é o momento
 *  de conferir se a rota está em `outputFileTracingIncludes`. */
const USOS_CONHECIDOS: Record<string, string> = {
  "src/actions/assinatura.ts": "/settings",
  "src/actions/settings.ts": "/settings",
}

function todosOsArquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome !== "node_modules" && nome !== "generated") todosOsArquivos(caminho, achados)
    } else if (/\.tsx?$/.test(nome) && !caminho.includes("__tests__")) {
      achados.push(caminho)
    }
  }
  return achados
}

function usamSharp(): string[] {
  return todosOsArquivos(join(RAIZ, "src"))
    .filter((f) => /(from\s+["']sharp["']|import\(["']sharp["']\))/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(RAIZ.length + 1).replace(/\\/g, "/"))
}

describe("o binário do sharp vai junto no deploy", () => {
  it("o next.config declara os binários de linux", () => {
    // Sem isto, tudo que passa pelo sharp falha só em produção.
    const config = readFileSync(join(RAIZ, "next.config.ts"), "utf8")
    expect(config).toContain("outputFileTracingIncludes")
    expect(config).toContain("@img/sharp-linux-x64")
    expect(config).toContain("@img/sharp-libvips-linux-x64")
  })

  it("todo arquivo que usa sharp está na lista conhecida", () => {
    // Se este teste falhar por causa de um arquivo NOVO: confira se a rota que
    // o chama está em outputFileTracingIncludes no next.config.ts, e só então
    // acrescente aqui.
    const novos = usamSharp().filter((f) => !(f in USOS_CONHECIDOS))
    expect(novos).toEqual([])
  })

  it("a lista não guarda arquivo que não existe mais", () => {
    // O outro lado: lista que envelhece deixa de valer como conferência.
    const reais = new Set(usamSharp())
    expect(Object.keys(USOS_CONHECIDOS).filter((f) => !reais.has(f))).toEqual([])
  })

  it("toda rota que usa sharp está no rastreamento", () => {
    const config = readFileSync(join(RAIZ, "next.config.ts"), "utf8")
    const semRastreio = [...new Set(Object.values(USOS_CONHECIDOS))].filter(
      (rota) => !config.includes(`"${rota}"`)
    )
    expect(semRastreio).toEqual([])
  })
})
