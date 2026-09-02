"use client"

// A compressão da foto NO APARELHO, antes de subir.
//
// Mora aqui, e não dentro de um componente, porque DOIS caminhos precisam
// dela: a galeria de fotos (OS e orçamento) e a nota do fornecedor. A segunda
// nasceu sem — e o resultado foi um recurso que falhava exatamente no aparelho
// em que ia ser usado: foto de celular tem 3–8 MB, o limite de corpo das
// Server Actions é 4 MB, e o HEIC do iPhone nem passa pela validação de tipo.
//
// Os limites de `lib/foto.ts` foram calibrados ASSUMINDO esta compressão.
// Separá-los foi o que permitiu que um caminho a esquecesse.

const LADO_MAXIMO = 1600
const QUALIDADE = 0.75

/**
 * Reduz a foto no próprio aparelho, antes de subir.
 *
 * É a decisão que faz a diferença em campo: foto de celular moderno tem 3–8 MB
 * e o técnico está num subsolo com 4G ruim. Depois disto fica em 200–400 KB —
 * a diferença entre enviar em segundos e desistir no meio.
 *
 * De quebra resolve o HEIC do iPhone: o canvas devolve JPEG, que todo mundo
 * abre, sem precisar de biblioteca de conversão.
 */
export async function comprimir(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALIDADE))
  // Se o navegador não devolver o blob (caso raro), envia o original em vez de
  // travar: melhor upload pesado que foto perdida.
  if (!blob) return arquivo
  return new File([blob], "foto.jpg", { type: "image/jpeg" })
}
