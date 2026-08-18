import { describe, expect, it } from "vitest"
import React from "react"
import { Document, Page, renderToBuffer } from "@react-pdf/renderer"
import parse from "parse-svg-path"
import abs from "abs-svg-path"
import { PixBloco } from "@/components/pdf/pix-bloco"
import { gerarQr } from "@/lib/qr"
import { cobrancaPix } from "@/lib/pix"

const tenant = {
  pixKey: "12345678909",
  pixKeyType: "CPF",
  pixReceiver: "Limpeza Ltda",
  pixCity: "Piracicaba",
}

function paginaCom(qrCaminho: string, tamanho: number) {
  return renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        null,
        React.createElement(PixBloco, {
          qr: { tamanho, caminho: qrCaminho },
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

  it("o desenho do QR sobrevive ao parser de path do react-pdf", () => {
    // O react-pdf não desenha SVG direto: passa o `d` por parse-svg-path e
    // abs-svg-path. Se ele engasgasse com `h`/`v`/`z` relativos, o caminho
    // sairia vazio — e o PDF continuaria sendo gerado, com um quadrado branco
    // no lugar do QR. Ninguém veria isso até um cliente tentar pagar.
    const comandos = abs(parse(qr.caminho))
    expect(comandos.length).toBeGreaterThan(100)
    // Cada retângulo vira M + 3 traços + fechamento; nenhum comando pode ter
    // NaN, que é como um parser confuso costuma falhar em silêncio.
    for (const c of comandos) {
      for (const n of c.slice(1)) {
        expect(Number.isFinite(n as number)).toBe(true)
      }
    }
    expect(comandos[0][0]).toBe("M")
  })

  it("todo o desenho cabe dentro do viewBox", () => {
    // Módulo fora do viewBox é módulo cortado, e QR cortado não lê.
    for (const [, ...args] of abs(parse(qr.caminho))) {
      for (let i = 0; i < args.length; i++) {
        expect(args[i] as number).toBeGreaterThanOrEqual(0)
        expect(args[i] as number).toBeLessThanOrEqual(qr.tamanho)
      }
    }
  })

  it("gera um PDF válido", async () => {
    const buf = await paginaCom(qr.caminho, qr.tamanho)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("o QR realmente entra no arquivo, não só o texto ao lado", async () => {
    // Comparar com um caminho vazio: se o react-pdf estivesse ignorando o
    // desenho, os dois arquivos teriam praticamente o mesmo tamanho.
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
