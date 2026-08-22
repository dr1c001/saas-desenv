// A assinatura gravada de cada pessoa da empresa.
//
// O problema que isto resolve começou como um defeito: a assinatura do CLIENTE
// era colhida na tela do celular, gravada no banco — e o PDF da OS imprimia
// duas linhas em branco para assinar no papel. Três das onze OS em produção
// tinham assinatura guardada e nenhuma saiu impressa. O trabalho de colher
// estava sendo jogado fora.
//
// E abriu a pergunta seguinte: e a assinatura de QUEM EXECUTOU? Um documento
// de serviço tem dois lados. Quem recebeu assina que recebeu; quem fez assina
// que fez. Só um dos dois estava sendo capturado, e nenhum impresso.
//
// Daí o desenho: cada pessoa da empresa — dono, administrador, técnico —
// desenha a assinatura dela UMA vez, e ela passa a sair sozinha nos documentos
// que aquela pessoa emite. Beto conclui a OS, sai a assinatura do Beto.
//
// Módulo puro: o que decide se um desenho vira assinatura válida precisa ser
// reproduzível num teste. Recusar errado deixa a pessoa sem conseguir assinar;
// aceitar errado põe lixo no documento que vai para o cliente final.

/** Só PNG. É o que o quadro de desenho produz (`toDataURL("image/png")`), e é
 *  o que o gerador de PDF sabe embutir sem depender de rede. */
const PREFIXO = "data:image/png;base64,"

/**
 * Teto do que chega do navegador, ANTES de reprocessar.
 *
 * Uma assinatura é um rabisco: o quadro de desenho aparado produz algo entre 2
 * e 30 KB. 600 KB é folgado o suficiente para tela grande em alta densidade, e
 * apertado o suficiente para recusar quem tentar mandar uma foto no lugar —
 * que é o que acontece quando o campo aceita qualquer coisa.
 */
export const MAX_BYTES = 600 * 1024

/**
 * Piso.
 *
 * Um PNG válido e minúsculo é o que sai de um toque acidental no quadro: um
 * ponto, ou uma linha de dois pixels. Gravar isso dá uma assinatura que parece
 * sujeira no documento, e a pessoa só descobre quando o cliente recebe.
 */
export const MIN_BYTES = 200

export type Recusa = "formato" | "grande" | "pequena"

/** Quantos bytes o base64 representa, sem decodificar. */
export function bytesDoBase64(base64: string): number {
  const limpo = base64.replace(/=+$/, "")
  return Math.floor((limpo.length * 3) / 4)
}

/**
 * O desenho serve como assinatura?
 *
 * Devolve o motivo da recusa em vez de um booleano: a tela precisa dizer à
 * pessoa o que fazer diferente, e "inválido" não diz nada. Assinatura recusada
 * em silêncio é a pessoa clicando salvar de novo até desistir.
 */
export function conferirAssinatura(dataUri: string): Recusa | null {
  if (typeof dataUri !== "string" || !dataUri.startsWith(PREFIXO)) return "formato"

  const base64 = dataUri.slice(PREFIXO.length)
  // Base64 puro. Sem isto, um data URI com caractere estranho chegaria ao
  // decodificador do servidor.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return "formato"

  const bytes = bytesDoBase64(base64)
  if (bytes > MAX_BYTES) return "grande"
  if (bytes < MIN_BYTES) return "pequena"
  return null
}

/** Monta o data URI a partir do PNG já reprocessado no servidor. */
export function comoDataUri(png: Buffer | Uint8Array): string {
  return `${PREFIXO}${Buffer.from(png).toString("base64")}`
}

/**
 * De quem é a assinatura que sai neste documento.
 *
 * Regra única, usada por OS, orçamento, contrato e ordem de compra: sai a de
 * quem RESPONDE pelo documento, e nada quando essa pessoa não gravou a dela.
 *
 * O `null` importa: um documento sem assinatura gravada continua saindo com a
 * linha para assinar à mão, como sempre foi. Ninguém fica sem documento por
 * não ter desenhado a assinatura ainda.
 */
export function assinaturaDe(
  pessoa: { name: string | null; signatureUrl: string | null } | null | undefined
): { nome: string; imagem: string } | null {
  if (!pessoa?.signatureUrl) return null
  return { nome: pessoa.name ?? "", imagem: pessoa.signatureUrl }
}
