import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Monta o e-mail de verdade (assunto + HTML) sem enviar nada: o Resend é
// trocado por um espião. Assim dá pra checar o conteúdo que o cliente
// receberia, que é onde erro de texto costuma passar batido.

const enviados: { subject: string; html: string; to: string; replyTo?: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
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

afterEach(() => vi.doUnmock("resend"))

async function enviar(dias: number, locale: "pt" | "en" = "pt") {
  const { sendPastDueWarningEmail } = await import("@/lib/resend")
  await sendPastDueWarningEmail("dona@livela.com.br", "Priscila", "Livela store", dias, locale)
  return enviados[0]
}

describe("e-mail de cobrança em atraso", () => {
  it("primeiro aviso: tom de lembrete, com o prazo certo", async () => {
    const e = await enviar(4)
    expect(e.subject).toContain("restam 4 dias")
    expect(e.html).toContain("Priscila")
    expect(e.html).toContain("Livela store")
    expect(e.html).toContain("mais 4 dias")
  })

  it("aviso final: assunto muda para o urgente", async () => {
    const e = await enviar(2)
    expect(e.subject).toContain("bloqueado em 2 dias")
    // Vermelho, não âmbar: o segundo aviso é o último antes do corte.
    expect(e.html).toContain("#dc2626")
  })

  it("singular certo quando falta 1 dia", async () => {
    const e = await enviar(1)
    expect(e.subject).toContain("1 dia")
    expect(e.subject).not.toContain("1 dias")
    expect(e.html).toContain("mais 1 dia<")
  })

  it("diz que nada é apagado e que o acesso volta sozinho", async () => {
    // A parte que evita cancelamento por pânico: o cliente precisa saber que
    // os dados dele continuam lá e que pagar resolve sem precisar falar com
    // ninguém.
    const e = await enviar(4)
    expect(e.html).toContain("Nada é apagado")
    expect(e.html).toContain("volta sozinho")
  })

  it("avisa que o bloqueio pega a equipe inteira", async () => {
    const e = await enviar(4)
    expect(e.html).toContain("toda a sua equipe")
  })

  it("trata quem já pagou e ainda não foi confirmado", async () => {
    const e = await enviar(2)
    expect(e.html).toContain("Já pagou?")
  })

  it("leva para a tela de cobrança e permite responder", async () => {
    const e = await enviar(4)
    expect(e.html).toContain("/billing")
    expect(e.replyTo).toBe("suporte@servicoos.com.br")
  })

  it("sai em inglês quando a empresa está em inglês", async () => {
    const e = await enviar(4, "en")
    expect(e.subject).toContain("4 days of access left")
    expect(e.html).toContain("Nothing is deleted")
  })
})
