// QR Code como caminho vetorial (path SVG).
//
// Por que caminho e nao imagem: o mesmo QR precisa aparecer no portal do
// cliente (HTML) e no PDF da OS e do orcamento. O @react-pdf nao renderiza
// GIF — que e o que o createDataURL da biblioteca devolve — mas desenha
// <Svg><Path>. Devolvendo o caminho, os dois lados usam a MESMA geometria:
// se o QR estiver certo na tela, esta certo no papel.
//
// Vetor tambem sobrevive à impressao. QR em bitmap esticado sai borrado, e
// leitor de celular apontando pra papel borrado nao le — o cliente desiste e
// liga pra empresa perguntar como paga.

import qrcode from "qrcode-generator"

/** Zona de silencio exigida pela norma. Sem ela, muito leitor não acha o código. */
const MARGEM = 4

export type Qr = {
  /** Lado do viewBox, em modulos, ja incluindo a margem dos dois lados. */
  tamanho: number
  /** Conteudo do atributo `d`, em coordenadas de 0 a `tamanho`. */
  caminho: string
}

/**
 * Gera o caminho do QR.
 *
 * Correcao de erro "M": o padrao do PIX. "L" cabe mais dado mas perdoa menos
 * sujeira e amassado no papel; "H" perdoa mais e engorda o código a ponto de
 * ficar denso demais pra impressao pequena.
 *
 * O caminho junta modulos escuros vizinhos numa mesma linha num retangulo so.
 * Um QR de PIX tem ~1000 modulos escuros; sem juntar, seriam 1000 subcaminhos
 * dentro de todo PDF gerado.
 */
export function gerarQr(texto: string): Qr {
  const qr = qrcode(0, "M") // 0 = escolhe a menor versão que couber
  qr.addData(texto)
  qr.make()

  const n = qr.getModuleCount()
  const partes: string[] = []

  for (let linha = 0; linha < n; linha++) {
    let inicio = -1
    // Vai ate n (inclusive) pra fechar a corrida que termina na borda.
    for (let col = 0; col <= n; col++) {
      const escuro = col < n && qr.isDark(linha, col)
      if (escuro && inicio === -1) inicio = col
      if (!escuro && inicio !== -1) {
        const largura = col - inicio
        partes.push(`M${inicio + MARGEM} ${linha + MARGEM}h${largura}v1h-${largura}z`)
        inicio = -1
      }
    }
  }

  return { tamanho: n + MARGEM * 2, caminho: partes.join("") }
}
