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

describe("link do botão de suporte", () => {
  const MSG = "Olá, tenho uma dúvida"

  it("monta o link a partir do número, com a mensagem inicial", async () => {
    const { linkWhatsappSuporte } = await import("@/lib/utils")
    expect(linkWhatsappSuporte("(19) 99280-2772", MSG)).toBe(
      "https://wa.me/5519992802772?text=Ol%C3%A1%2C%20tenho%20uma%20d%C3%BAvida"
    )
  })

  it("usa o link curto do WhatsApp Business como veio", async () => {
    // O formato wa.me/message/CÓDIGO já carrega a saudação configurada na
    // conta e ignora ?text= — anexar ali só sujaria a URL.
    const { linkWhatsappSuporte } = await import("@/lib/utils")
    expect(linkWhatsappSuporte("https://wa.me/message/AEG5ASAST4GTK1", MSG)).toBe(
      "https://wa.me/message/AEG5ASAST4GTK1"
    )
  })

  it("aceita os outros endereços oficiais", async () => {
    const { linkWhatsappSuporte } = await import("@/lib/utils")
    expect(linkWhatsappSuporte("https://api.whatsapp.com/send?phone=5519992802772", MSG)).toContain(
      "api.whatsapp.com"
    )
  })

  it("recusa endereço que não é do WhatsApp", async () => {
    // Erro de digitação no domínio mandaria todo visitante do site pra fora,
    // e ninguém perceberia porque o link continua abrindo alguma coisa.
    const { linkWhatsappSuporte } = await import("@/lib/utils")
    expect(linkWhatsappSuporte("https://wa.me.evil.com/123", MSG)).toBeNull()
    expect(linkWhatsappSuporte("https://exemplo.com/contato", MSG)).toBeNull()
  })

  it("devolve null quando não há nada configurado", async () => {
    const { linkWhatsappSuporte } = await import("@/lib/utils")
    expect(linkWhatsappSuporte(undefined, MSG)).toBeNull()
    expect(linkWhatsappSuporte("   ", MSG)).toBeNull()
  })
})
