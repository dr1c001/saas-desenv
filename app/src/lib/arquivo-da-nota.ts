import { prisma } from "./prisma"
import { baixarArquivo, enviarArquivo } from "./storage"
import { formatOsNumber } from "./utils"

// Arquivar a nota fiscal emitida: o PDF e o XML, no nosso storage.
//
// ─── Por que ────────────────────────────────────────────────────────────────
//
// Do documento fiscal, o sistema guardava uma URL para o servidor do emissor.
// Três problemas de uma vez:
//
//   1. Juridicamente quem vale é o XML — o PDF é só uma representação — e o
//      XML nem era lido, embora o emissor o devolva.
//   2. A empresa é obrigada a guardar documento fiscal por CINCO ANOS. Um link
//      para o servidor de um fornecedor não é guardar.
//   3. No dia em que ela trocar de emissor, as notas somem do sistema que ela
//      usa todo dia — e o cliente que pedir a nota de novo não terá de onde.
//
// ─── Quando arquiva ─────────────────────────────────────────────────────────
//
// Na conciliação diária, no instante em que a prefeitura ACEITA. Antes disso o
// documento não é final: uma nota rejeitada não tem PDF que preste, e uma
// pendente ainda vai mudar.
//
// E também sob demanda, na primeira vez que alguém pedir para baixar — é assim
// que as notas emitidas ANTES desta mudança entram no arquivo, sem migração em
// massa e sem varrer o histórico de todo mundo no cron.
//
// ─── Nunca lança ────────────────────────────────────────────────────────────
//
// Roda dentro do cron e dentro de uma rota de download. Uma falha de rede ao
// buscar o PDF não pode derrubar a conciliação de todas as notas, nem impedir
// a pessoa de abrir o link do emissor, que continua existindo.

/** Onde o arquivo mora no storage. */
export function caminhoDaNota(
  tenantId: string,
  orderId: string,
  tipo: "pdf" | "xml"
): string {
  return `notas-fiscais/${tenantId}/${orderId}.${tipo}`
}

/** Tamanho mínimo para o conteúdo ser documento, e não página de erro. */
const MINIMO_PLAUSIVEL = 512

async function baixar(url: string): Promise<Buffer | null> {
  try {
    // Timeout curto: isto roda no cron, que tem sessenta segundos para todas as
    // etapas. Documento fiscal que demora é documento fiscal que fica para
    // amanhã.
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    // Uma resposta minúscula é página de erro do emissor. Arquivá-la seria pior
    // que não arquivar nada: o sistema passaria a dizer que tem a nota.
    if (buf.length < MINIMO_PLAUSIVEL) return null
    return buf
  } catch {
    return null
  }
}

export type ResultadoDoArquivamento = { pdf: boolean; xml: boolean }

/**
 * Baixa o PDF e o XML do emissor e guarda no storage.
 *
 * Só grava o caminho na OS quando o arquivo entrou de verdade — um caminho
 * gravado apontando para nada faria o download devolver 404 dizendo que a nota
 * está arquivada.
 */
export async function arquivarNota(entrada: {
  tenantId: string
  orderId: string
  pdfUrl: string | null | undefined
  xmlUrl: string | null | undefined
  /** Não refaz o que já está arquivado. */
  jaTemPdf?: boolean
  jaTemXml?: boolean
}): Promise<ResultadoDoArquivamento> {
  const { tenantId, orderId } = entrada
  const feito: ResultadoDoArquivamento = { pdf: false, xml: false }

  try {
    const dados: { nfsePdfPath?: string; nfseXmlPath?: string } = {}

    if (entrada.pdfUrl && !entrada.jaTemPdf) {
      const buf = await baixar(entrada.pdfUrl)
      if (buf) {
        const caminho = caminhoDaNota(tenantId, orderId, "pdf")
        await enviarArquivo(caminho, buf, "application/pdf")
        dados.nfsePdfPath = caminho
        feito.pdf = true
      }
    }

    if (entrada.xmlUrl && !entrada.jaTemXml) {
      const buf = await baixar(entrada.xmlUrl)
      if (buf) {
        const caminho = caminhoDaNota(tenantId, orderId, "xml")
        await enviarArquivo(caminho, buf, "application/xml")
        dados.nfseXmlPath = caminho
        feito.xml = true
      }
    }

    if (Object.keys(dados).length > 0) {
      await prisma.serviceOrder.update({ where: { id: orderId }, data: dados })
    }
  } catch (e) {
    // Nunca lança: a conciliação de todas as outras notas não pode cair por
    // causa do storage de uma.
    console.error("[nota] falhou ao arquivar:", orderId, e)
  }

  return feito
}

/**
 * O arquivo da nota, para download.
 *
 * Serve o que está arquivado. Quando não há — nota emitida antes desta
 * mudança —, busca no emissor, ARQUIVA e serve. É assim que o histórico entra
 * no arquivo: por quem pede, e não por uma varredura que releria a base
 * inteira de todo mundo.
 *
 * `null` quando não existe nota, ou quando o emissor não responde. A tela
 * continua tendo o link direto para ele.
 */
export async function arquivoDaNota(
  tenantId: string,
  orderId: string,
  tipo: "pdf" | "xml"
): Promise<{ conteudo: Buffer; nomeArquivo: string } | null> {
  const os = await prisma.serviceOrder.findFirst({
    // tenantId no filtro: a nota fiscal de outra empresa tem o CNPJ e o
    // faturamento dela dentro.
    where: { id: orderId, tenantId },
    select: {
      id: true,
      number: true,
      createdAt: true,
      nfseNumber: true,
      nfseUrl: true,
      nfsePdfPath: true,
      nfseXmlPath: true,
    },
  })
  if (!os) return null

  const nome = `nota-fiscal-${os.nfseNumber ?? formatOsNumber(os.number, os.createdAt)}.${tipo}`
  const caminhoGravado = tipo === "pdf" ? os.nfsePdfPath : os.nfseXmlPath

  if (caminhoGravado) {
    const conteudo = await baixarArquivo(caminhoGravado)
    if (conteudo) return { conteudo, nomeArquivo: nome }
    // Caminho gravado e arquivo ausente: o storage perdeu, ou alguém apagou.
    // Cai para o emissor em vez de devolver "não existe" — a nota existe.
  }

  // Arquivamento tardio. O XML não tem URL guardada (só o PDF tem, em
  // `nfseUrl`), então só o PDF é recuperável desta forma.
  if (tipo === "pdf" && os.nfseUrl) {
    const buf = await baixar(os.nfseUrl)
    if (!buf) return null
    try {
      const caminho = caminhoDaNota(tenantId, os.id, "pdf")
      await enviarArquivo(caminho, buf, "application/pdf")
      await prisma.serviceOrder.update({ where: { id: os.id }, data: { nfsePdfPath: caminho } })
    } catch (e) {
      // Não conseguiu arquivar, mas conseguiu o documento: entrega mesmo assim.
      console.error("[nota] falhou ao arquivar sob demanda:", os.id, e)
    }
    return { conteudo: buf, nomeArquivo: nome }
  }

  return null
}
