import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Cada etapa do cron diário precisa ter o SEU try/catch.
//
// ─── O defeito que isto pega ─────────────────────────────────────────────────
//
// O `try` da geração de OS de contratos recorrentes não tinha `catch` logo
// depois: a próxima linha abria OUTRO `try`. O `catch` dele ficava 159 linhas
// abaixo, e no meio estavam, indentados com os mesmos dois espaços como se
// fossem irmãos, QUATRO blocos independentes — certificado vencendo,
// conciliação de notas fiscais, avisos de fim do teste grátis e conferência das
// comissões.
//
// Bastava `gerarOsDosContratos` lançar para o dia inteiro perder as quatro:
// ninguém avisado de certificado vencendo, nota rejeitada pela prefeitura
// passando em branco, quem estava no fim do teste sem aviso (e
// `decidirAvisoDeFim` conta POSIÇÃO na escada — o marco passa e não volta), e
// comissão divergente não conferida. O log dizia só "Falha ao gerar OS de
// contratos recorrentes", escondendo as outras quatro.
//
// (Achado na auditoria de 13/09/2026.)
//
// ─── Por que um teste que lê o CÓDIGO-FONTE ─────────────────────────────────
//
// O mesmo motivo de cron-resumo.test.ts, no arquivo ao lado: exercitar o
// handler exigiria simular Asaas, geocodificação, e-mail e emissor fiscal para
// provar uma questão de ESTRUTURA. E o defeito não foi de comportamento — foi
// de indentação mentindo sobre o aninhamento, que é exatamente o que ninguém
// enxerga relendo o diff.

const FONTE = join(process.cwd(), "src/app/api/cron/daily/route.ts")

/** As linhas do handler, sem o que vem depois dele. */
function linhas(): string[] {
  // O arquivo tem fim de linha do Windows, e a comparação abaixo é exata: sem
  // tirar o `\r`, `"  try {"` nunca bate e o teste passaria sem olhar nada.
  return readFileSync(FONTE, "utf-8").split(/\r?\n/)
}

/**
 * Para cada `try {` no primeiro nível (dois espaços), a linha em que o bloco
 * dele se fecha. Conta chaves, ignorando as que aparecem dentro de texto.
 */
function blocosDeTopo(ls: string[]): { abre: number; fecha: number }[] {
  const blocos: { abre: number; fecha: number }[] = []
  for (let i = 0; i < ls.length; i++) {
    if (ls[i] !== "  try {") continue
    let profundidade = 1
    for (let j = i + 1; j < ls.length && profundidade > 0; j++) {
      const semTexto = ls[j].replace(/"[^"]*"|'[^']*'|`[^`]*`|\/\/.*$/g, "")
      profundidade += (semTexto.match(/\{/g) ?? []).length
      profundidade -= (semTexto.match(/\}/g) ?? []).length
      if (profundidade === 0) {
        blocos.push({ abre: i + 1, fecha: j + 1 })
        break
      }
    }
  }
  return blocos
}

/** Os cabeçalhos de etapa: `  // ── Nome da etapa ──…` */
function etapas(ls: string[]): { linha: number; nome: string }[] {
  return ls
    .map((l, i) => ({ linha: i + 1, texto: l }))
    .filter((x) => /^ {2}\/\/ ── /.test(x.texto))
    .map((x) => ({ linha: x.linha, nome: x.texto.replace(/^ {2}\/\/ ── /, "").split("─")[0].trim() }))
}

describe("o cron isola cada etapa", () => {
  it("nenhum try de primeiro nível atravessa o cabeçalho da etapa seguinte", () => {
    // É a forma exata do defeito: o bloco de uma etapa engolindo as de baixo.
    const ls = linhas()
    const blocos = blocosDeTopo(ls)
    const marcos = etapas(ls)
    expect(blocos.length).toBeGreaterThan(3)

    const invasores = blocos.filter((b) =>
      marcos.some((m) => m.linha > b.abre && m.linha < b.fecha)
    )

    expect(
      invasores.map((b) => {
        const engolidas = marcos
          .filter((m) => m.linha > b.abre && m.linha < b.fecha)
          .map((m) => m.nome)
        return `try da linha ${b.abre} engole: ${engolidas.join(", ")}`
      })
    ).toEqual([])
  })

  it("todo try de primeiro nível fecha, e fecha perto", () => {
    // Um bloco de mais de cem linhas é o sintoma que denunciava o defeito. O
    // limite é generoso de propósito: o que se quer impedir é o bloco que
    // atravessa o arquivo, não o que tem uma consulta longa dentro.
    const ls = linhas()
    for (const b of blocosDeTopo(ls)) {
      expect(b.fecha).toBeGreaterThan(b.abre)
      expect(b.fecha - b.abre).toBeLessThan(120)
    }
  })

  it("cada etapa que existe é anunciada por um cabeçalho", () => {
    // Guarda contra a próxima etapa entrar sem marco — que é o que faz o
    // primeiro teste deixar de enxergá-la.
    const nomes = etapas(linhas()).map((e) => e.nome)
    for (const esperado of [
      "Certificado digital perto de vencer",
      "Teste grátis chegando ao fim",
      "Conferente das comissões",
    ]) {
      expect(nomes).toContain(esperado)
    }
  })
})
