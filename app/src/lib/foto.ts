// Fotos da ordem de serviço: regras de aceitação e caminho no armazenamento.
//
// Por que isto existe: em serviço de campo, a foto É a entrega. O antes e
// depois da limpeza, o vazamento encontrado, o equipamento instalado — é o que
// encerra discussão sobre "não fizeram nada" e o que o cliente final mostra
// pra quem pagou. A tabela Attachment existia no banco desde o início e nunca
// teve nada escrito nela.
//
// Módulo puro: o que decide se um arquivo entra, e onde ele fica guardado,
// precisa ser testável sem rede e sem banco.

export const BUCKET = "os-fotos"

/** Tipos aceitos. HEIC do iPhone não entra: o navegador converte pra JPEG
 *  antes de enviar (ver a compressão no componente de upload). */
export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const

/** Teto por arquivo DEPOIS da compressão feita no aparelho.
 *  Foto de celular moderno tem 3–8 MB; comprimida fica em 200–400 KB. 5 MB
 *  aqui é folga larga pra caso raro, não o tamanho esperado. */
export const MAX_BYTES = 5 * 1024 * 1024

/** Teto por OS. Não é limite técnico — é o que impede uma OS com 200 fotos
 *  tornar a página inútil e o armazenamento imprevisível. */
export const MAX_FOTOS_POR_OS = 10

export type MotivoRecusa =
  | "tipoNaoAceito"
  | "arquivoVazio"
  | "muitoGrande"
  | "limitePorOs"

/**
 * Decide se um arquivo pode entrar.
 *
 * `jaTem` é quantas fotos a OS já possui — a checagem de limite mora aqui e
 * não no banco pra que a mensagem de recusa seja a mesma em qualquer chamador.
 */
export function validarFoto(
  arquivo: { type: string; size: number },
  jaTem: number
): MotivoRecusa | null {
  if (jaTem >= MAX_FOTOS_POR_OS) return "limitePorOs"
  if (arquivo.size === 0) return "arquivoVazio"
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) return "tipoNaoAceito"
  if (arquivo.size > MAX_BYTES) return "muitoGrande"
  return null
}

export function extensaoDe(tipo: string): string {
  if (tipo === "image/png") return "png"
  if (tipo === "image/webp") return "webp"
  return "jpg"
}

/**
 * Caminho do arquivo no armazenamento.
 *
 * O tenantId vem PRIMEIRO de propósito: o isolamento entre empresas fica
 * visível na própria estrutura de pastas, e uma regra de acesso por prefixo
 * (hoje ou no futuro) tem onde se apoiar. Sem isso, um id de arquivo vazado
 * não teria nada indicando de quem ele é.
 */
export function caminhoDaFoto(
  tenantId: string,
  orderId: string,
  fotoId: string,
  tipo: string
): string {
  return `${tenantId}/${orderId}/${fotoId}.${extensaoDe(tipo)}`
}

/**
 * Confere que um caminho pertence mesmo à empresa antes de gerar link ou
 * apagar. Vale como segunda barreira: a consulta ao banco já filtra por
 * tenant, mas caminho é string vinda de linha do banco — e linha de banco
 * pode ter sido escrita errado por um bug futuro.
 */
export function caminhoPertenceAoTenant(caminho: string, tenantId: string): boolean {
  return caminho.startsWith(`${tenantId}/`)
}

/** Nome legível pra exibir e pro download, sem depender do nome original. */
export function nomeExibicao(indice: number, tipo: string): string {
  return `foto-${String(indice + 1).padStart(2, "0")}.${extensaoDe(tipo)}`
}
