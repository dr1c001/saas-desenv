import { describe, expect, it } from "vitest"
import { normalizarWhatsappBR } from "@/lib/utils"

// O botão flutuante do WhatsApp ficou apontando pro número de exemplo
// 5511999999999 até 11/08/2026. Ninguém percebeu porque falha em silêncio: o
// link abre normalmente, só que numa conversa com ninguém. Estes testes
// existem pra que a próxima falha desse tipo apareça aqui, não em produção.
describe("número de WhatsApp do suporte", () => {
  it("acrescenta o código do país quando vem só DDD + número", () => {
    // O caso real: quem configura digita como fala.
    expect(normalizarWhatsappBR("(19) 99280-2772")).toBe("5519992802772")
    expect(normalizarWhatsappBR("19992802772")).toBe("5519992802772")
  })

  it("aceita fixo de 8 dígitos", () => {
    expect(normalizarWhatsappBR("(19) 3333-4444")).toBe("551933334444")
  })

  it("mantém quando já vem com o país", () => {
    expect(normalizarWhatsappBR("+55 19 99280-2772")).toBe("5519992802772")
    expect(normalizarWhatsappBR("5519992802772")).toBe("5519992802772")
  })

  it("recusa o que não dá pra confiar", () => {
    // Melhor não mostrar o botão do que mandar o visitante pra lugar nenhum.
    expect(normalizarWhatsappBR(undefined)).toBeNull()
    expect(normalizarWhatsappBR("")).toBeNull()
    expect(normalizarWhatsappBR("123")).toBeNull()
    expect(normalizarWhatsappBR("abc")).toBeNull()
    expect(normalizarWhatsappBR("5519992802772000")).toBeNull()
  })
})
