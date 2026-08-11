import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// O ponto mais perigoso de ter um ambiente de teste: o banco de teste é uma
// CÓPIA do real, e uma cópia tem os e-mails reais dos clientes finais. Testar
// o aviso de inadimplência dispararia cobrança para gente que não deve nada.
//
// Este arquivo prova que o desvio acontece no caminho real de envio, não só na
// função isolada.

const enviar = vi.fn().mockResolvedValue({ error: null })

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviar }
  },
}))

const original = { ...process.env }

beforeEach(() => {
  enviar.mockClear()
  process.env.RESEND_API_KEY = "chave-de-teste"
  delete process.env.VERCEL_ENV
  delete process.env.STAGING_EMAIL
  delete process.env.SUPER_ADMIN_EMAIL
})

afterEach(() => {
  process.env = { ...original }
  vi.resetModules()
})

describe("envio de e-mail por ambiente", () => {
  it("em produção vai para o destinatário real, sem prefixo", async () => {
    process.env.VERCEL_ENV = "production"
    const { sendWelcomeEmail } = await import("@/lib/resend")

    await sendWelcomeEmail("cliente@empresa.com.br", "Ana", "pt")

    const payload = enviar.mock.calls[0][0]
    expect(payload.to).toBe("cliente@empresa.com.br")
    expect(payload.subject).not.toContain("[TESTE]")
  })

  it("fora de produção NUNCA vai para o cliente final", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.STAGING_EMAIL = "dono@exemplo.com"
    const { sendWelcomeEmail } = await import("@/lib/resend")

    await sendWelcomeEmail("cliente@empresa.com.br", "Ana", "pt")

    const payload = enviar.mock.calls[0][0]
    expect(payload.to).toBe("dono@exemplo.com")
    // O destinatário original fica no assunto: sem isso não dá pra conferir
    // que o e-mail certo foi para a pessoa certa.
    expect(payload.subject).toContain("cliente@empresa.com.br")
    expect(payload.subject).toContain("[TESTE]")
  })

  it("aborta em vez de enviar quando não há destino seguro configurado", async () => {
    // Falhar alto é melhor que mandar aviso de cobrança pro cliente de outra
    // empresa a partir de um banco de cópia.
    process.env.VERCEL_ENV = "preview"
    const { sendWelcomeEmail } = await import("@/lib/resend")

    await expect(sendWelcomeEmail("cliente@empresa.com.br", "Ana", "pt")).rejects.toThrow(
      /STAGING_EMAIL/
    )
    expect(enviar).not.toHaveBeenCalled()
  })

  it("na máquina do desenvolvedor também desvia", async () => {
    process.env.SUPER_ADMIN_EMAIL = "dono@exemplo.com"
    const { sendWelcomeEmail } = await import("@/lib/resend")

    await sendWelcomeEmail("cliente@empresa.com.br", "Ana", "pt")

    expect(enviar.mock.calls[0][0].to).toBe("dono@exemplo.com")
  })
})
