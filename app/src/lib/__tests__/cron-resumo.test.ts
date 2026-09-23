import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// O RESUMO do cron diário precisa mencionar toda etapa que ele executa.
//
// ─── O defeito que isto pega ─────────────────────────────────────────────────
//
// O cron acumula contadores num objeto `results` e grava uma linha de texto em
// `CronRun.detail`. Essa linha é a ÚNICA janela para o que aconteceu: a função
// termina, o objeto some, e o que não entrou no texto deixa de existir.
//
// O conferente de comissões foi ligado no cron em 05/09/2026 com três
// contadores próprios. Ele rodou três dias seguidos, e não havia nenhuma forma
// de saber disso olhando produção — a linha gravada não citava nenhum deles.
// (Achado olhando a tabela de execuções em 08/09/2026.)
//
// ─── Por que um teste que lê o CÓDIGO-FONTE ─────────────────────────────────
//
// Exercitar o route handler exigiria simular Asaas, geocodificação, e-mail,
// emissor fiscal e mais meia dúzia de coisas — para conferir uma linha de
// texto. E o defeito não é de comportamento: é de alguém acrescentar um
// contador e esquecer do resumo, que é o que vai acontecer de novo.
//
// Este repositório já usa a mesma tática para o service worker: um teste que
// compara a lista de rotas em lib/sw-estrategia.ts com a cópia em public/sw.js.

const FONTE = join(process.cwd(), "src/app/api/cron/daily/route.ts")

/**
 * Contadores que NÃO precisam aparecer no resumo, e o motivo de cada um.
 *
 * Lista fechada de propósito: acrescentar algo aqui tem de ser uma decisão
 * consciente, e não o caminho fácil para o teste parar de reclamar.
 */
const FORA_DO_RESUMO: Record<string, string> = {
  // Texto, e não contagem: é o mês do retrato ("2026-09"), e o retrato tem
  // registro próprio na tabela dele.
  retrato: "é o mês do retrato, que tem registro próprio",
  // Aparece no resumo com outro nome, escrito por extenso: "N erro(s)".
  errors: "aparece escrito como 'erro(s)'",
}

function lerFonte(): string {
  return readFileSync(FONTE, "utf8")
}

/** As chaves do objeto `results`, na declaração dele. */
function contadores(fonte: string): string[] {
  const i = fonte.indexOf("const results = {")
  expect(i, "a declaração de `results` mudou de forma").toBeGreaterThan(-1)
  const j = fonte.indexOf("}", i)
  const corpo = fonte.slice(i + "const results = {".length, j)
  return corpo
    .split(",")
    .map((p) => p.split(":")[0].trim())
    .filter((k) => /^[a-zA-Z]\w*$/.test(k))
}

/** O trecho que monta a linha gravada em CronRun.detail. */
function resumo(fonte: string): string {
  const i = fonte.indexOf("detail:")
  expect(i, "o campo `detail` mudou de forma").toBeGreaterThan(-1)
  return fonte.slice(i, fonte.indexOf("\n        },", i))
}

describe("o resumo gravado do cron", () => {
  it("menciona TODA etapa que o cron conta", () => {
    const fonte = lerFonte()
    const texto = resumo(fonte)

    const esquecidos = contadores(fonte).filter(
      (k) => !(k in FORA_DO_RESUMO) && !texto.includes(`results.${k}`)
    )

    expect(
      esquecidos,
      `Estes contadores existem no cron e NÃO aparecem na linha gravada — ` +
        `a etapa vai rodar todo dia sem deixar rastro: ${esquecidos.join(", ")}`
    ).toEqual([])
  })

  it("o conferente de comissões está lá, nominalmente", () => {
    // O caso que originou este teste. Vale o nome, e não só a contagem: quem
    // lê a linha precisa saber que a divergência foi PROCURADA.
    const texto = resumo(lerFonte())
    expect(texto).toContain("results.comissoesConferidas")
    expect(texto).toContain("results.comissoesDivergentes")
  })

  it("a lista de exceções não cresce por descuido", () => {
    // Cada nome aqui é uma decisão de não registrar algo. Duas eram as que
    // existiam quando este teste foi escrito; uma terceira precisa de motivo
    // escrito, e este teste é onde ele fica.
    expect(Object.keys(FORA_DO_RESUMO).sort()).toEqual(["errors", "retrato"])
  })
})
