import { inflateRawSync } from "node:zlib"

// Leitura de planilhas (.csv e .xlsx) sem dependência externa.
//
// Por que não usar uma biblioteca: o `xlsx` (SheetJS) publicado no npm parou
// em 2022 e carrega CVEs conhecidas; o `exceljs` resolve, mas arrasta 90
// pacotes — incluindo o `archiver`, que ESCREVE zip, sendo que aqui só se lê.
// Um .xlsx é um zip com dois XMLs dentro e o Node já traz zlib, então o leitor
// abaixo custa menos que a superfície que evitamos.
//
// O objetivo deste módulo é só chegar em `string[][]`. Interpretar o que cada
// coluna significa é problema de quem chama (ver lib/importar-clientes.ts).

export type LinhaPlanilha = string[]

export class PlanilhaInvalida extends Error {
  constructor(readonly motivo: MotivoInvalida) {
    super(motivo)
    this.name = "PlanilhaInvalida"
  }
}

// Motivos são chaves de tradução, não texto: quem exibe decide o idioma.
export type MotivoInvalida =
  | "formatoNaoSuportado"
  | "arquivoVazio"
  | "arquivoCorrompido"
  | "xlsProtegidoOuAntigo"
  | "semAbas"

// ─── CSV ──────────────────────────────────────────────────────────────────────

// O Excel em português salva CSV com ponto-e-vírgula (porque a vírgula é o
// separador decimal) e, dependendo da opção escolhida, em Windows-1252 em vez
// de UTF-8. Um parser que assume vírgula+UTF-8 transforma a planilha inteira
// numa coluna só com "José" virando "Jos?". Por isso os dois são detectados.
export function decodificarTexto(buf: Buffer): string {
  // BOM de UTF-8: o Excel escreve quando você escolhe "CSV UTF-8".
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8")
  }
  try {
    // fatal: true faz o decode falhar em byte inválido em vez de devolver "�"
    // silenciosamente — é o que permite distinguir UTF-8 de Windows-1252.
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return buf.toString("latin1")
  }
}

export function detectarSeparador(texto: string): string {
  // Só a primeira linha interessa (o cabeçalho), e fora de aspas: um nome como
  // "Silva, João" na primeira linha de dados enganaria a contagem global.
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] ?? ""
  const candidatos = [";", ",", "\t", "|"]
  let melhor = ","
  let maior = 0
  for (const sep of candidatos) {
    let contagem = 0
    let dentroDeAspas = false
    for (let i = 0; i < primeiraLinha.length; i++) {
      const c = primeiraLinha[i]
      if (c === '"') dentroDeAspas = !dentroDeAspas
      else if (c === sep && !dentroDeAspas) contagem++
    }
    if (contagem > maior) {
      maior = contagem
      melhor = sep
    }
  }
  return melhor
}

export function lerCSV(buf: Buffer): LinhaPlanilha[] {
  const texto = decodificarTexto(buf)
  const sep = detectarSeparador(texto)

  const linhas: LinhaPlanilha[] = []
  let campos: string[] = []
  let atual = ""
  let dentroDeAspas = false

  const fecharCampo = () => {
    campos.push(atual)
    atual = ""
  }
  const fecharLinha = () => {
    fecharCampo()
    linhas.push(campos)
    campos = []
  }

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (dentroDeAspas) {
      if (c === '"') {
        // "" dentro de campo entre aspas é uma aspa literal — não o fim dele.
        if (texto[i + 1] === '"') {
          atual += '"'
          i++
        } else {
          dentroDeAspas = false
        }
      } else {
        atual += c
      }
      continue
    }

    if (c === '"' && atual === "") dentroDeAspas = true
    else if (c === sep) fecharCampo()
    else if (c === "\n") fecharLinha()
    else if (c === "\r") continue // CRLF do Windows: o \n seguinte fecha a linha
    else atual += c
  }

  // Sem quebra de linha no fim do arquivo, a última linha ainda está pendente.
  if (atual !== "" || campos.length > 0) fecharLinha()

  return descartarLinhasVazias(linhas)
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

type ArquivoZip = { nome: string; conteudo: Buffer }

// Leitor de zip mínimo: só o que um .xlsx de Excel/Google Sheets usa —
// armazenado (método 0) ou deflate (método 8). Zip64 e conteúdo cifrado são
// recusados de forma explícita em vez de devolver lixo.
function lerZip(buf: Buffer): ArquivoZip[] {
  const ASSINATURA_EOCD = 0x06054b50
  const ASSINATURA_CENTRAL = 0x02014b50

  // O "End of Central Directory" fica no fim, mas pode ter até 64KB de
  // comentário depois dele — por isso a busca é de trás pra frente.
  let posEocd = -1
  const limite = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= limite; i--) {
    if (buf.readUInt32LE(i) === ASSINATURA_EOCD) {
      posEocd = i
      break
    }
  }
  if (posEocd < 0) throw new PlanilhaInvalida("arquivoCorrompido")

  const totalEntradas = buf.readUInt16LE(posEocd + 10)
  const inicioCentral = buf.readUInt32LE(posEocd + 16)

  // 0xffff / 0xffffffff são os marcadores de Zip64. Planilha de cliente nunca
  // chega lá; se chegou, é outro arquivo — melhor recusar que ler errado.
  if (totalEntradas === 0xffff || inicioCentral === 0xffffffff) {
    throw new PlanilhaInvalida("arquivoCorrompido")
  }

  const arquivos: ArquivoZip[] = []
  let pos = inicioCentral

  for (let n = 0; n < totalEntradas; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== ASSINATURA_CENTRAL) {
      throw new PlanilhaInvalida("arquivoCorrompido")
    }

    const flags = buf.readUInt16LE(pos + 8)
    const metodo = buf.readUInt16LE(pos + 10)
    const tamanhoComprimido = buf.readUInt32LE(pos + 20)
    const tamanhoNome = buf.readUInt16LE(pos + 28)
    const tamanhoExtra = buf.readUInt16LE(pos + 30)
    const tamanhoComentario = buf.readUInt16LE(pos + 32)
    const posCabecalhoLocal = buf.readUInt32LE(pos + 42)
    const nome = buf.subarray(pos + 46, pos + 46 + tamanhoNome).toString("utf8")

    // Bit 0 do flag = arquivo cifrado. Excel com senha cai aqui.
    if (flags & 0x1) throw new PlanilhaInvalida("xlsProtegidoOuAntigo")

    // O tamanho do campo "extra" do cabeçalho LOCAL costuma ser diferente do
    // que está no diretório central — ler o do central desalinha os dados.
    if (posCabecalhoLocal + 30 > buf.length) throw new PlanilhaInvalida("arquivoCorrompido")
    const nomeLocal = buf.readUInt16LE(posCabecalhoLocal + 26)
    const extraLocal = buf.readUInt16LE(posCabecalhoLocal + 28)
    const inicioDados = posCabecalhoLocal + 30 + nomeLocal + extraLocal
    const bruto = buf.subarray(inicioDados, inicioDados + tamanhoComprimido)

    let conteudo: Buffer
    if (metodo === 0) conteudo = Buffer.from(bruto)
    else if (metodo === 8) {
      try {
        conteudo = inflateRawSync(bruto)
      } catch {
        throw new PlanilhaInvalida("arquivoCorrompido")
      }
    } else throw new PlanilhaInvalida("arquivoCorrompido")

    arquivos.push({ nome, conteudo })
    pos += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario
  }

  return arquivos
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodificarXml(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (inteiro, corpo: string) => {
    if (corpo[0] === "#") {
      const cod =
        corpo[1] === "x" || corpo[1] === "X"
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10)
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : inteiro
    }
    return ENTIDADES[corpo] ?? inteiro
  })
}

// A tabela de strings compartilhadas. Texto com formatação parcial ("João" em
// negrito só no "Jo") vira vários <r><t>...</t></r> dentro do mesmo <si>, e
// todos precisam ser concatenados — pegar só o primeiro trunca o valor.
function lerStringsCompartilhadas(xml: string): string[] {
  const strings: string[] = []
  for (const item of xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? []) {
    let texto = ""
    for (const t of item.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []) {
      texto += decodificarXml(t.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, ""))
    }
    strings.push(texto)
  }
  return strings
}

// "A" -> 0, "Z" -> 25, "AA" -> 26. Necessário porque célula vazia simplesmente
// não aparece no XML: sem olhar a referência, "João | | 11999" viraria
// "João | 11999" e o telefone cairia na coluna do e-mail.
export function colunaParaIndice(letras: string): number {
  let indice = 0
  for (const letra of letras.toUpperCase()) {
    indice = indice * 26 + (letra.charCodeAt(0) - 64)
  }
  return indice - 1
}

function lerAba(xml: string, compartilhadas: string[]): LinhaPlanilha[] {
  const linhas: LinhaPlanilha[] = []

  for (const linhaXml of xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) ?? []) {
    const celulas: string[] = []

    for (const celulaXml of linhaXml.match(/<c[ >][\s\S]*?<\/c>|<c[^>]*\/>/g) ?? []) {
      const ref = /\sr="([A-Z]+)\d+"/.exec(celulaXml)?.[1]
      const tipo = /\st="([^"]+)"/.exec(celulaXml)?.[1]
      const indice = ref ? colunaParaIndice(ref) : celulas.length

      let valor = ""
      if (tipo === "inlineStr") {
        for (const t of celulaXml.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []) {
          valor += decodificarXml(t.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, ""))
        }
      } else {
        const bruto = /<v[^>]*>([\s\S]*?)<\/v>/.exec(celulaXml)?.[1]
        if (bruto !== undefined) {
          const conteudo = decodificarXml(bruto)
          if (tipo === "s") valor = compartilhadas[Number(conteudo)] ?? ""
          else if (tipo === "b") valor = conteudo === "1" ? "true" : "false"
          else valor = conteudo
        }
      }

      // Preenche o buraco deixado por células omitidas.
      while (celulas.length < indice) celulas.push("")
      celulas[indice] = valor
    }

    linhas.push(celulas)
  }

  return descartarLinhasVazias(linhas)
}

export function lerXLSX(buf: Buffer): LinhaPlanilha[] {
  const arquivos = lerZip(buf)
  const pega = (nome: string) => arquivos.find((a) => a.nome === nome)?.conteudo.toString("utf8")

  const compartilhadas = lerStringsCompartilhadas(pega("xl/sharedStrings.xml") ?? "")

  // A primeira aba do arquivo nem sempre é sheet1.xml — depende da ordem em que
  // o usuário criou/moveu as abas. workbook.xml.rels resolve o id para o
  // caminho real; sem ele, cai no primeiro sheet encontrado.
  const relacoes = pega("xl/_rels/workbook.xml.rels") ?? ""
  const workbook = pega("xl/workbook.xml") ?? ""
  const primeiroId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  const alvo = primeiroId
    ? new RegExp(`<Relationship[^>]*Id="${primeiroId}"[^>]*Target="([^"]+)"`).exec(relacoes)?.[1]
    : undefined

  const caminho = alvo
    ? `xl/${alvo.replace(/^\/?xl\//, "").replace(/^\//, "")}`
    : arquivos.find((a) => /^xl\/worksheets\/.*\.xml$/.test(a.nome))?.nome

  const aba = caminho ? pega(caminho) : undefined
  if (!aba) throw new PlanilhaInvalida("semAbas")

  return lerAba(aba, compartilhadas)
}

// ─── Entrada única ────────────────────────────────────────────────────────────

function descartarLinhasVazias(linhas: LinhaPlanilha[]): LinhaPlanilha[] {
  return linhas.filter((l) => l.some((c) => c.trim() !== ""))
}

export function lerPlanilha(buf: Buffer, nomeArquivo: string): LinhaPlanilha[] {
  if (buf.length === 0) throw new PlanilhaInvalida("arquivoVazio")

  const extensao = nomeArquivo.toLowerCase().split(".").pop() ?? ""

  // Confere pela assinatura, não pela extensão: um .xlsx renomeado pra .csv
  // (ou o contrário) é engano comum e o erro seria incompreensível.
  const ehZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b

  // .xls antigo (BIFF/OLE2) começa com D0 CF 11 E0 e não é zip — não dá pra ler
  // aqui, mas o usuário merece saber o motivo em vez de "arquivo corrompido".
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    throw new PlanilhaInvalida("xlsProtegidoOuAntigo")
  }

  if (ehZip) return lerXLSX(buf)
  if (extensao === "csv" || extensao === "txt" || !extensao) return lerCSV(buf)

  throw new PlanilhaInvalida("formatoNaoSuportado")
}
