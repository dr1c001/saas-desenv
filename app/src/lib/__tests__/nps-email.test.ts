import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// O e-mail de NPS pedia ao cliente final que desse nota ao SERVIÇOOS.
//
// "Como foi sua experiência com o ServiçoOS?", "o quanto você indicaria o
// ServiçoOS para outros empresários?", resposta para o nosso suporte. Mas quem
// recebe é o morador que chamou a desentupidora — ele nunca ouviu falar de
// ServiçoOS. O link abre o portal com o cabeçalho da EMPRESA perguntando "qual
// a probabilidade de você NOS recomendar?", e a nota vira ServiceOrder.npsScore,
// que o relatório soma como satisfação do atendimento da empresa. E-mail e
// portal faziam perguntas diferentes para a mesma nota.
// (Achado na auditoria de 13/09/2026.)

const enviados: { subject: string; html: string; to: string; replyTo?: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
  process.env.VERCEL_ENV = "production"
  vi.doMock("resend", () => ({
    Resend: class {
      emails = {
        send: async (p: { subject: string; html: string; to: string; replyTo?: string }) => {
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

async function enviar(locale: "pt" | "en" = "pt", responderPara: string | null = "dona@silva.com.br") {
  const { sendNpsEmail } = await import("@/lib/resend")
  await sendNpsEmail("morador@ex.com", "João", "Desentupidora Silva", "tok123", locale, responderPara)
  return enviados[0]
}

describe("a pesquisa de satisfação", () => {
  it("pergunta sobre a EMPRESA — a mesma pergunta do portal, para a mesma nota", async () => {
    const e = await enviar()
    expect(e.html).toContain("recomendar Desentupidora Silva")
    expect(e.html).not.toMatch(/indicaria o ServiçoOS|experiência com o ServiçoOS|empresários/)
  })

  it("chega em nome da empresa: cabeçalho e assunto com o nome dela", async () => {
    const e = await enviar()
    expect(e.subject).toBe("Desentupidora Silva — como foi o atendimento?")
    expect(e.html).toContain(`<h2 style="margin:0 0 16px">Desentupidora Silva</h2>`)
    // Sem o cabeçalho roxo do ServiçoOS: quem fala é a empresa.
    expect(e.html).not.toContain("#7c3aed")
  })

  it("a resposta vai para o dono da empresa, não para o nosso suporte", async () => {
    const e = await enviar()
    expect(e.replyTo).toBe("dona@silva.com.br")
  })

  it("sem e-mail do dono, cai no suporte — melhor que um endereço que não existe", async () => {
    const e = await enviar("pt", null)
    expect(e.replyTo).toBe("suporte@servicoos.com.br")
  })

  it("os onze links de nota continuam apontando para o token da OS", async () => {
    const e = await enviar()
    for (let n = 0; n <= 10; n++) expect(e.html).toContain(`/api/nps?token=tok123&score=${n}`)
  })

  it("em inglês, a mesma coisa", async () => {
    const e = await enviar("en")
    expect(e.html).toContain("recommend Desentupidora Silva")
    expect(e.html).not.toMatch(/ServiçoOS/)
  })

  it("o nome da empresa entra escapado no corpo", async () => {
    const { sendNpsEmail } = await import("@/lib/resend")
    await sendNpsEmail("morador@ex.com", "João", "Silva & Cia <Refrigeração>", "tok", "pt", null)
    expect(enviados[0].html).toContain("recomendar Silva &amp; Cia &lt;Refrigeração&gt;")
    expect(enviados[0].html).not.toContain("<Refrigeração>")
  })
})
