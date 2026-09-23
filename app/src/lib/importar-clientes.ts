import type { LinhaPlanilha } from "@/lib/planilha"

// Traduz uma planilha genérica (string[][]) em clientes prontos pra gravar.
//
// Módulo puro de propósito: é aqui que mora a decisão de o que é erro (pula a
// linha) e o que é aviso (importa mesmo assim), e isso precisa ser testável sem
// banco, sem sessão e sem upload.

// Teto por arquivo. Não é limite de negócio — é o que cabe com folga no tempo
// de execução da função na Vercel. Acima disso o usuário divide a planilha, e
// reimportar é seguro porque documento/e-mail repetidos são detectados.
export const MAX_LINHAS = 2000

export type ColunaCliente =
  | "name" | "document" | "email" | "phone" | "whatsapp" | "status"
  | "street" | "number" | "complement" | "district" | "city" | "state" | "zipCode"

// Sinônimos por coluna, já normalizados (ver normalizar()). A planilha do
// cliente veio do jeito que ele escreveu, não do jeito que o sistema chama:
// "Razão Social", "CNPJ", "Fone", "Celular", "Endereço" são todos comuns.
const SINONIMOS: Record<ColunaCliente, string[]> = {
  name: ["nome", "cliente", "nomecliente", "nomedocliente", "razaosocial", "razao", "empresa", "name", "customer", "client"],
  document: ["cpf", "cnpj", "cpfcnpj", "documento", "doc", "cpfoucnpj", "document", "taxid"],
  email: ["email", "emails", "correioeletronico", "mail"],
  phone: ["telefone", "fone", "tel", "telefonefixo", "fixo", "contato", "phone"],
  whatsapp: ["whatsapp", "whats", "celular", "zap", "movel", "mobile", "cell"],
  status: ["status", "situacao", "ativo"],
  street: ["rua", "endereco", "logradouro", "street", "address"],
  number: ["numero", "num", "nro", "number"],
  complement: ["complemento", "compl", "complement"],
  district: ["bairro", "district", "neighborhood"],
  city: ["cidade", "municipio", "city"],
  state: ["estado", "uf", "state"],
  zipCode: ["cep", "codigopostal", "zipcode", "zip", "postalcode"],
}

// Sem acento, sem pontuação, sem espaço, minúsculo: "CPF / CNPJ", "cpf_cnpj" e
// "Cpf Cnpj" têm que cair todos em "cpfcnpj".
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    // \p{Diacritic} = as marcas que o NFD separa da letra. Antes era uma
    // classe com os caracteres combinantes literais, que ficam invisiveis no
    // arquivo e qualquer editor ou merge pode comer sem ninguem notar.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function mapearColunas(cabecalho: LinhaPlanilha): Partial<Record<ColunaCliente, number>> {
  const mapa: Partial<Record<ColunaCliente, number>> = {}

  cabecalho.forEach((celula, indice) => {
    const alvo = normalizar(celula)
    if (!alvo) return
    for (const [coluna, nomes] of Object.entries(SINONIMOS) as [ColunaCliente, string[]][]) {
      // Primeira coluna vence: planilha com "Telefone" e "Telefone 2" mantém a
      // primeira em vez de a última sobrescrever silenciosamente.
      if (mapa[coluna] === undefined && nomes.includes(alvo)) {
        mapa[coluna] = indice
        return
      }
    }
  })

  return mapa
}

export type ClienteImportado = {
  name: string
  document: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  status: "ACTIVE" | "INACTIVE" | "DEFAULTER"
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  zipCode: string | null
}

// motivo é chave de tradução; `linha` é o número que o usuário vê no Excel
// (1-based, contando o cabeçalho) — dizer "linha 3" e ele achar a linha 4 na
// planilha transforma a correção num quebra-cabeça.
export type Ocorrencia = { linha: number; motivo: string; detalhe?: string }

export type ResultadoAnalise = {
  colunas: Partial<Record<ColunaCliente, number>>
  clientes: ClienteImportado[]
  erros: Ocorrencia[]
  avisos: Ocorrencia[]
  duplicadosNoArquivo: number
  totalLinhas: number
}

export class ImportacaoInvalida extends Error {
  constructor(readonly motivo: "semCabecalho" | "semColunaNome" | "excedeLimite" | "semLinhas") {
    super(motivo)
    this.name = "ImportacaoInvalida"
  }
}

const STATUS_ACEITOS: Record<string, "ACTIVE" | "INACTIVE" | "DEFAULTER"> = {
  ativo: "ACTIVE", ativa: "ACTIVE", active: "ACTIVE", sim: "ACTIVE", s: "ACTIVE", "1": "ACTIVE",
  inativo: "INACTIVE", inativa: "INACTIVE", inactive: "INACTIVE", nao: "INACTIVE", n: "INACTIVE", "0": "INACTIVE",
  inadimplente: "DEFAULTER", devedor: "DEFAULTER", defaulter: "DEFAULTER",
}

// Deliberadamente frouxo: o objetivo é barrar "joao@" e "não tem", não julgar
// se o domínio existe. Recusar e-mail válido raro é pior que aceitar um errado,
// porque o campo é opcional e editável depois.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "")
}

// Chave de duplicidade: documento (só dígitos) e e-mail (minúsculo). Nome NÃO
// entra — "João Silva" repetido é normal e legítimo, e usar nome como chave
// descartaria clientes de verdade sem o usuário entender por quê.
export function chavesDeDuplicidade(c: ClienteImportado): string[] {
  const chaves: string[] = []
  const doc = c.document ? soDigitos(c.document) : ""
  if (doc.length >= 11) chaves.push(`doc:${doc}`)
  if (c.email) chaves.push(`email:${c.email.toLowerCase()}`)
  return chaves
}

export function analisarPlanilha(linhas: LinhaPlanilha[]): ResultadoAnalise {
  if (linhas.length === 0) throw new ImportacaoInvalida("semCabecalho")

  const colunas = mapearColunas(linhas[0])

  // Sem coluna de nome não há o que importar. Acontece quando a planilha não
  // tem cabeçalho — aí a primeira linha de dados seria consumida como título e
  // um cliente sumiria em silêncio. Melhor recusar e mandar usar o modelo.
  if (colunas.name === undefined) throw new ImportacaoInvalida("semColunaNome")

  const corpo = linhas.slice(1)
  if (corpo.length === 0) throw new ImportacaoInvalida("semLinhas")
  if (corpo.length > MAX_LINHAS) throw new ImportacaoInvalida("excedeLimite")

  const clientes: ClienteImportado[] = []
  const erros: Ocorrencia[] = []
  const avisos: Ocorrencia[] = []
  const vistas = new Set<string>()
  let duplicadosNoArquivo = 0

  corpo.forEach((linha, i) => {
    const numeroLinha = i + 2 // +1 pelo cabeçalho, +1 porque o Excel conta de 1
    const pega = (col: ColunaCliente): string => {
      const indice = colunas[col]
      return indice === undefined ? "" : (linha[indice] ?? "").trim()
    }

    const name = pega("name")
    if (name.length < 2) {
      erros.push({ linha: numeroLinha, motivo: "nomeInvalido", detalhe: name || undefined })
      return
    }

    let email: string | null = pega("email") || null
    if (email && !EMAIL.test(email)) {
      // Aviso, não erro: perder o cliente inteiro por causa de um e-mail com
      // erro de digitação é pior que importar sem o e-mail e avisar qual foi.
      avisos.push({ linha: numeroLinha, motivo: "emailIgnorado", detalhe: email })
      email = null
    }

    const statusBruto = normalizar(pega("status"))
    const status = STATUS_ACEITOS[statusBruto] ?? "ACTIVE"
    if (statusBruto && !STATUS_ACEITOS[statusBruto]) {
      avisos.push({ linha: numeroLinha, motivo: "statusDesconhecido", detalhe: pega("status") })
    }

    const cliente: ClienteImportado = {
      name,
      document: pega("document") || null,
      email,
      phone: pega("phone") || null,
      whatsapp: pega("whatsapp") || null,
      status,
      street: pega("street") || null,
      number: pega("number") || null,
      complement: pega("complement") || null,
      district: pega("district") || null,
      city: pega("city") || null,
      state: pega("state") || null,
      zipCode: pega("zipCode") || null,
    }

    const chaves = chavesDeDuplicidade(cliente)
    if (chaves.some((k) => vistas.has(k))) {
      duplicadosNoArquivo++
      avisos.push({ linha: numeroLinha, motivo: "duplicadoNoArquivo", detalhe: name })
      return
    }
    chaves.forEach((k) => vistas.add(k))

    clientes.push(cliente)
  })

  return { colunas, clientes, erros, avisos, duplicadosNoArquivo, totalLinhas: corpo.length }
}
