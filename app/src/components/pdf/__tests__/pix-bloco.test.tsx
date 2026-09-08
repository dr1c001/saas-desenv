import { describe, expect, it } from "vitest"
import React from "react"
import { Document, Page, renderToBuffer } from "@react-pdf/renderer"
import { PixBloco } from "@/components/pdf/pix-bloco"
import { gerarQr } from "@/lib/qr"
import { cobrancaPix } from "@/lib/pix"

const tenant = {
  pixKey: "12345678909",
  pixKeyType: "CPF",
  pixReceiver: "Limpeza Ltda",
  pixCity: "Piracicaba",
}

function paginaCom(caminho: string, tamanho: number) {
  return renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        null,
        React.createElement(PixBloco, {
          qr: { tamanho, caminho },
          chave: "12345678909",
          recebedor: "Limpeza Ltda",
          locale: "pt" as const,
        })
      )
    ) as never
  )
}

describe("bloco de PIX no PDF", () => {
  const cobranca = cobrancaPix(tenant, 450, "OS20260042")!
  const qr = gerarQr(cobranca.codigo)

  it("todo o desenho cabe dentro do viewBox", () => {
    // Módulo fora do viewBox é módulo cortado, e QR cortado não lê.
    const partes = [...qr.caminho.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)]
    expect(partes.length).toBeGreaterThan(50)
    for (const g of partes) {
      const [x, y, largura] = [+g[1], +g[2], +g[3]]
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + largura).toBeLessThanOrEqual(qr.tamanho)
      expect(y + 1).toBeLessThanOrEqual(qr.tamanho)
    }
  })

  it("gera um PDF válido", async () => {
    const buf = await paginaCom(qr.caminho, qr.tamanho)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("o QR realmente entra no arquivo, não só o texto ao lado", async () => {
    // Esta é a prova de que o parser de path do react-pdf entende os comandos
    // relativos que lib/qr.ts emite (h/v/z). Se engasgasse, o caminho sairia
    // vazio: o PDF continuaria sendo gerado, com um quadrado branco no lugar
    // do QR, e ninguém veria isso até um cliente tentar pagar. Comparar com o
    // caminho vazio faz a diferença aparecer aqui.
    const [comQr, semQr] = await Promise.all([
      paginaCom(qr.caminho, qr.tamanho),
      paginaCom("", qr.tamanho),
    ])
    expect(comQr.length).toBeGreaterThan(semQr.length + 1000)
  })

  it("QR de códigos diferentes gera arquivos diferentes", async () => {
    // Garante que o desenho vem do código, e não de algo fixo no layout.
    const outro = gerarQr(cobrancaPix(tenant, 999, "OS20260099")!.codigo)
    const [a, b] = await Promise.all([
      paginaCom(qr.caminho, qr.tamanho),
      paginaCom(outro.caminho, outro.tamanho),
    ])
    expect(a.equals(b)).toBe(false)
  })
})
