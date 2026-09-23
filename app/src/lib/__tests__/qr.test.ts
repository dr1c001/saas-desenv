import { describe, expect, it } from "vitest"
import qrcode from "qrcode-generator"
import { gerarQr } from "@/lib/qr"

const MARGEM = 4

/** Remonta a matriz a partir do caminho, pra comparar com a original. */
function matrizDoCaminho(caminho: string, tamanho: number): boolean[][] {
  const m: boolean[][] = Array.from({ length: tamanho }, () => Array(tamanho).fill(false))
  const re = /M(\d+) (\d+)h(\d+)v1h-\3z/g
  let g: RegExpExecArray | null
  while ((g = re.exec(caminho)) !== null) {
    const [x, y, largura] = [Number(g[1]), Number(g[2]), Number(g[3])]
    for (let i = 0; i < largura; i++) m[y][x + i] = true
  }
  return m
}

describe("QR", () => {
  const texto =
    "00020101021226330014br.gov.bcb.pix011112345678909520400005303986540510.005802BR5912Limpeza Ltda6010Piracicaba62070503***6304B0FA"

  it("o caminho reproduz exatamente a matriz da biblioteca", () => {
    // O que o código faz de próprio é juntar módulos escuros vizinhos num
    // retângulo só. Um erro aí desloca módulo e o celular não lê — mas o
    // desenho continua "parecendo" um QR. Por isso a comparação é módulo a
    // módulo contra a fonte da verdade, não uma inspeção visual.
    const { tamanho, caminho } = gerarQr(texto)
    const remontada = matrizDoCaminho(caminho, tamanho)

    const qr = qrcode(0, "M")
    qr.addData(texto)
    qr.make()
    const n = qr.getModuleCount()

    for (let linha = 0; linha < n; linha++) {
      for (let col = 0; col < n; col++) {
        expect(remontada[linha + MARGEM][col + MARGEM]).toBe(qr.isDark(linha, col))
      }
    }
  })

  it("deixa a zona de silêncio em volta", () => {
    // Sem a borda branca, muito leitor não acha o código na página.
    const { tamanho, caminho } = gerarQr(texto)
    const m = matrizDoCaminho(caminho, tamanho)
    for (let i = 0; i < tamanho; i++) {
      for (let j = 0; j < MARGEM; j++) {
        expect(m[i][j]).toBe(false)
        expect(m[i][tamanho - 1 - j]).toBe(false)
        expect(m[j][i]).toBe(false)
        expect(m[tamanho - 1 - j][i]).toBe(false)
      }
    }
  })

  it("cresce quando o texto cresce, e continua quadrado", () => {
    const curto = gerarQr("oi")
    const longo = gerarQr(texto)
    expect(longo.tamanho).toBeGreaterThan(curto.tamanho)
    expect(curto.caminho.length).toBeGreaterThan(0)
  })
})
