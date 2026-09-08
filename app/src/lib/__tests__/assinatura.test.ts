import { describe, expect, it } from "vitest"
import {
  assinaturaDe,
  bytesDoBase64,
  comoDataUri,
  conferirAssinatura,
  MAX_BYTES,
  MIN_BYTES,
} from "@/lib/assinatura"

/** Data URI de PNG com o tamanho pedido, para testar as bordas sem carregar
 *  arquivo. O conteúdo não precisa ser um PNG de verdade: quem valida a imagem
 *  é o reprocessamento no servidor, e o que se testa aqui é a regra. */
function png(bytes: number): string {
  const base64 = "A".repeat(Math.ceil((bytes * 4) / 3))
  return `data:image/png;base64,${base64}`
}

describe("o que serve como assinatura", () => {
  it("aceita um rabisco de tamanho normal", () => {
    expect(conferirAssinatura(png(8_000))).toBeNull()
  })

  it("recusa o que não é PNG", () => {
    // O quadro de desenho produz PNG. Outra coisa chegando aqui significa que
    // alguém montou a requisição à mão.
    for (const ruim of [
      "data:image/jpeg;base64,AAAA",
      "data:image/svg+xml;base64,AAAA",
      "https://exemplo/assinatura.png",
      "",
    ]) {
      expect(conferirAssinatura(ruim), ruim.slice(0, 30)).toBe("formato")
    }
  })

  it("recusa base64 com caractere estranho", () => {
    // Sem isto, um data URI adulterado chega ao decodificador do servidor.
    expect(conferirAssinatura("data:image/png;base64,AA<script>")).toBe("formato")
    expect(conferirAssinatura("data:image/png;base64,AA AA")).toBe("formato")
  })

  it("recusa arquivo grande — é foto, não assinatura", () => {
    expect(conferirAssinatura(png(MAX_BYTES + 5_000))).toBe("grande")
  })

  it("recusa toque acidental — vira sujeira no documento do cliente", () => {
    expect(conferirAssinatura(png(50))).toBe("pequena")
  })

  it("diz o MOTIVO, não só que recusou", () => {
    // Recusa sem motivo é a pessoa clicando salvar de novo até desistir.
    expect(conferirAssinatura(png(50))).not.toBe(conferirAssinatura(png(MAX_BYTES + 1_000)))
  })
})

describe("contagem de bytes", () => {
  it("desconta o preenchimento do base64", () => {
    expect(bytesDoBase64("QUFB")).toBe(3)
    expect(bytesDoBase64("QUE=")).toBe(2)
    expect(bytesDoBase64("QQ==")).toBe(1)
  })

  it("o piso e o teto ficam de fora, não em cima da borda", () => {
    expect(conferirAssinatura(png(MIN_BYTES + 100))).toBeNull()
    expect(conferirAssinatura(png(MAX_BYTES - 1_000))).toBeNull()
  })
})

describe("monta o data URI do servidor", () => {
  it("o que sai daqui passa na própria conferência", () => {
    // Se não passasse, a assinatura reprocessada no servidor seria recusada na
    // próxima leitura — e ninguém descobriria até alguém tentar reassinar.
    const uri = comoDataUri(Buffer.alloc(5_000, 1))
    expect(conferirAssinatura(uri)).toBeNull()
  })
})

describe("de quem é a assinatura do documento", () => {
  it("sai a de quem responde pelo documento", () => {
    expect(assinaturaDe({ name: "Beto", signatureUrl: "data:image/png;base64,AAA" })).toEqual({
      nome: "Beto",
      imagem: "data:image/png;base64,AAA",
    })
  })

  it("sem assinatura gravada, o documento sai como sempre saiu", () => {
    // O documento não pode deixar de existir porque a pessoa ainda não
    // desenhou a assinatura dela — sai com a linha para assinar à mão.
    expect(assinaturaDe({ name: "Beto", signatureUrl: null })).toBeNull()
    expect(assinaturaDe(null)).toBeNull()
    expect(assinaturaDe(undefined)).toBeNull()
  })

  it("pessoa sem nome não quebra o documento", () => {
    expect(assinaturaDe({ name: null, signatureUrl: "data:image/png;base64,AAA" })).toEqual({
      nome: "",
      imagem: "data:image/png;base64,AAA",
    })
  })
})
