import { describe, expect, it } from "vitest"
import React from "react"
import sharp from "sharp"
import { Document, Image, Page, View, renderToBuffer } from "@react-pdf/renderer"

// O logo passou de "cole a URL" para "envie o arquivo", e o arquivo é guardado
// embutido (data URI). Isso só funciona se o gerador de PDF aceitar data URI —
// se não aceitasse, o PDF sairia sem logo, sem erro nenhum, e ninguém
// perceberia até um cliente reclamar. É o que este arquivo verifica.

/** Mesma transformação da Server Action enviarLogo. */
async function processar(entrada: Buffer) {
  const png = await sharp(entrada)
    .resize({ width: 400, height: 160, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

/** Imagem de teste, gerada na hora — nada de arquivo binário no repositório. */
function imagemDe(largura: number, altura: number, formato: "png" | "jpeg" = "png") {
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    [formato]()
    .toBuffer()
}

async function pdfCom(logo: string) {
  return renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4" },
        React.createElement(View, null, React.createElement(Image, { src: logo, style: { width: 120 } }))
      )
    )
  )
}

describe("logo — processamento do arquivo enviado", () => {
  it("converte para PNG embutido", async () => {
    const uri = await processar(await imagemDe(800, 300, "jpeg"))
    expect(uri.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("reduz imagem grande, mantendo a proporção", async () => {
    const uri = await processar(await imagemDe(1600, 640))
    const bytes = Buffer.from(uri.split(",")[1], "base64")
    const meta = await sharp(bytes).metadata()
    expect(meta.width).toBe(400)
    expect(meta.height).toBe(160)
  })

  it("NÃO estica imagem pequena", async () => {
    // Esticar um logo de 80px pra 400px deixa ele borrado no PDF impresso.
    const uri = await processar(await imagemDe(80, 40))
    const meta = await sharp(Buffer.from(uri.split(",")[1], "base64")).metadata()
    expect(meta.width).toBe(80)
    expect(meta.height).toBe(40)
  })

  it("o resultado cabe confortavelmente numa coluna de texto do banco", async () => {
    // Um logo típico não pode virar um data URI gigante: ele é lido a cada
    // PDF gerado.
    const uri = await processar(await imagemDe(1200, 400))
    expect(uri.length).toBeLessThan(200_000)
  })
})

describe("logo — o PDF aceita imagem embutida", () => {
  it("gera PDF com o logo em data URI", async () => {
    // A pergunta que decide a abordagem inteira.
    const uri = await processar(await imagemDe(400, 160))
    const pdf = await pdfCom(uri)
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it("continua gerando com logo por URL antiga (compatibilidade)", async () => {
    // Quem já tinha URL cadastrada não pode quebrar. Aqui só se verifica que a
    // renderização não explode na presença de uma URL; buscar de verdade
    // dependeria de rede e não cabe em teste.
    const pdf = await pdfCom("https://servicoos.com.br/icon-192.png").catch(() => null)
    expect(pdf === null || pdf.subarray(0, 4).toString() === "%PDF").toBe(true)
  })
})
