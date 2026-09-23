import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// O vocabulário da empresa nunca chegava aos e-mails.
//
// A tela de Vocabulário promete: "a palavra escolhida aparece nas telas, nos
// PDFs, no WhatsApp e nos e-mails". Telas, PDF e WhatsApp obedeciam. Os nove
// envios de lib/resend.ts recebiam só o idioma, e o tradutor era montado com
// as mensagens do padrão — a empresa de TI que trocou "OS" por "Chamado"
// mandava e-mail dizendo "ordem de serviço". (Achado na auditoria de
// 13/09/2026.)
//
// A correção mudou o parâmetro dos nove: em vez de `locale`, um objeto
// `{ locale, vocabulary }` com `vocabulary` OBRIGATÓRIO — para o próximo
// chamador não esquecer, e o typecheck recusar um select de tenant sem ele.

const enviados: { subject: string; html: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
  process.env.VERCEL_ENV = "production"
  vi.doMock("resend", () => ({
    Resend: class {
      emails = {
        send: async (p: { subject: string; html: string }) => {
          enviados.push(p)
          return { data: { id: "x" }, error: null }
        },
      }
    },
  }))
})

afterEach(() => {
  vi.doUnmock("resend")
  delete process.env.VERCEL_ENV
})

// O que Configurações › Vocabulário grava para uma empresa que fala "chamado".
const CHAMADO = {
  locale: "pt" as const,
  vocabulary: { os: { curto: "Chamado", singular: "chamado", plural: "chamados", genero: "m" } },
}
const PADRAO = { locale: "pt" as const, vocabulary: null }

describe("o vocabulário da empresa nos e-mails", () => {
  it("a dica do dia 3 diz 'chamado' para quem diz 'chamado'", async () => {
    const { sendOnboardingDay3Email } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@ex.com", "Ana", 12, CHAMADO)

    expect(enviados[0].subject).toMatch(/chamado/i)
    expect(enviados[0].html).toMatch(/chamado/i)
    expect(enviados[0].subject).not.toMatch(/ordem de serviço|\bOS\b/)
  })

  it("e continua dizendo 'ordem de serviço' para quem não mexeu", async () => {
    const { sendOnboardingDay3Email } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@ex.com", "Ana", 12, PADRAO)

    expect(enviados[0].subject).toMatch(/ordem de serviço|\bOS\b/)
    expect(enviados[0].subject).not.toMatch(/chamado/i)
  })

  it("a pesquisa de satisfação ao cliente final também — é o mesmo cliente que recebe o PDF", async () => {
    const { sendNpsEmail } = await import("@/lib/resend")
    await sendNpsEmail("morador@ex.com", "João", "TI Norte", "tok", CHAMADO, null)

    expect(enviados[0].html).toMatch(/chamado foi concluído/i)
    expect(enviados[0].html).not.toMatch(/ordem de serviço/i)
  })

  it("o aviso de atraso fala das coisas da empresa com as palavras dela", async () => {
    const { sendPastDueWarningEmail } = await import("@/lib/resend")
    await sendPastDueWarningEmail("dona@ex.com", "Ana", "TI Norte", 10, CHAMADO)

    expect(enviados[0].html).toMatch(/chamados/i)
    expect(enviados[0].html).not.toMatch(/ordens de serviço/i)
  })

  it("nenhum marcador [[...]] vaza, com ou sem vocabulário", async () => {
    const { sendOnboardingDay3Email, sendNpsEmail } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@ex.com", "Ana", 12, CHAMADO)
    await sendNpsEmail("morador@ex.com", "João", "TI Norte", "tok", PADRAO, null)

    for (const e of enviados) {
      expect(e.subject).not.toContain("[[")
      expect(e.html).not.toContain("[[")
    }
  })
})

describe("o tradutor de e-mail é UM", () => {
  // Estrutural: o defeito era nove `getTranslator(locale, "emails")` soltos,
  // cada um esquecendo o vocabulário. Agora há um ponto só, e quem escrever o
  // décimo envio com `getTranslator(` direto cai aqui.
  it("lib/resend.ts monta tradutor num lugar só, e ele recebe o vocabulário", async () => {
    const fonte = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/resend.ts", "utf-8"))
    const chamadas = fonte.match(/getTranslator\(/g) ?? []
    expect(chamadas).toHaveLength(1)
    expect(fonte).toContain('getTranslator(empresa.locale, "emails", empresa.vocabulary)')
  })

  it("nenhum envio recebe só o idioma: o tipo exige o vocabulário", async () => {
    const fonte = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/resend.ts", "utf-8"))
    expect(fonte).not.toMatch(/locale: "pt" \| "en"\s*[,)]/)
    expect(fonte).toContain("export type EmpresaDoEmail = { locale: \"pt\" | \"en\"; vocabulary: unknown }")
  })
})
