import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AVISOS_ATRASO, PAST_DUE_GRACE_DAYS } from "@/lib/past-due"

// Monta o e-mail de verdade (assunto + HTML) sem enviar nada: o Resend é
// trocado por um espião. Assim dá pra checar o conteúdo que o cliente
// receberia, que é onde erro de texto costuma passar batido.

const enviados: { subject: string; html: string; to: string; replyTo?: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
  // O que se testa aqui é o e-mail que o CLIENTE recebe, então o ambiente
  // precisa ser produção. Fora dela, lib/resend.ts desvia todo envio para o
  // endereço do dono e reescreve o assunto — o desvio em si tem teste próprio
  // em resend-ambiente.test.ts.
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

async function enviar(dias: number, locale: "pt" | "en" = "pt") {
  const { sendPastDueWarningEmail } = await import("@/lib/resend")
  await sendPastDueWarningEmail("dona@livela.com.br", "Priscila", "Livela store", dias, locale)
  return enviados[0]
}

/** Dias restantes num marco da régua, derivado em vez de cravado.
 *
 *  Os números aqui eram fixos (4, 2, 1) e vinham da carência de 5 dias. Quando
 *  ela virou 30, "4 restantes" deixou de ser o primeiro lembrete e virou
 *  urgente — os testes quebraram apontando para o lugar errado, porque
 *  descreviam a régua velha em vez de seguir a atual. */
const restamNoMarco = (marco: number) => PAST_DUE_GRACE_DAYS - marco

const PRIMEIRO = restamNoMarco(AVISOS_ATRASO[0])
const PENULTIMO = restamNoMarco(AVISOS_ATRASO[AVISOS_ATRASO.length - 2])

describe("e-mail de cobrança em atraso", () => {
  it("primeiro aviso: tom de lembrete, com o prazo certo", async () => {
    const e = await enviar(PRIMEIRO)
    expect(e.subject).toContain(`restam ${PRIMEIRO} dias`)
    expect(e.html).toContain("Priscila")
    expect(e.html).toContain("Livela store")
    expect(e.html).toContain(`mais ${PRIMEIRO} dias`)
    // Âmbar: ainda falta quase um mês, não é hora de vermelho.
    expect(e.html).toContain("#f59e0b")
  })

  it("penúltimo aviso: assunto muda para o urgente", async () => {
    const e = await enviar(PENULTIMO)
    expect(e.subject).toContain(`bloqueado em ${PENULTIMO} dias`)
    // Vermelho, não âmbar: o corte está perto.
    expect(e.html).toContain("#dc2626")
  })

  it("no dia do corte o texto é OUTRO — não 'faltam 0 dias'", async () => {
    // O defeito que a carência de 30 dias criaria se o último marco usasse o
    // mesmo template: o e-mail do dia do bloqueio diria "restam 0 dias de
    // acesso" para quem acabou de perder o acesso.
    const e = await enviar(0)
    expect(e.subject).toContain("bloqueado")
    expect(e.subject).not.toContain("0 dia")
    expect(e.html).toContain("Toda a equipe está sem acesso")
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
    const e = await enviar(PRIMEIRO)
    expect(e.html).toContain("Nada é apagado")
    expect(e.html).toContain("volta sozinho")
  })

  it("avisa que o bloqueio pega a equipe inteira", async () => {
    const e = await enviar(PRIMEIRO)
    expect(e.html).toContain("toda a sua equipe")
  })

  it("trata quem já pagou e ainda não foi confirmado", async () => {
    const e = await enviar(PENULTIMO)
    expect(e.html).toContain("Já pagou?")
  })

  it("leva para a tela de cobrança e permite responder", async () => {
    const e = await enviar(PRIMEIRO)
    expect(e.html).toContain("/billing")
    expect(e.replyTo).toBe("suporte@servicoos.com.br")
  })

  it("sai em inglês quando a empresa está em inglês", async () => {
    const e = await enviar(PRIMEIRO, "en")
    expect(e.subject).toContain(`${PRIMEIRO} days of access left`)
    expect(e.html).toContain("Nothing is deleted")
  })
})
