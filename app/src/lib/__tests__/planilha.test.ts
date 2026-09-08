import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  colunaParaIndice,
  decodificarTexto,
  detectarSeparador,
  lerCSV,
  lerPlanilha,
  lerXLSX,
  PlanilhaInvalida,
} from "@/lib/planilha"

// As amostras em fixtures/ foram geradas por openpyxl e pelo módulo csv do
// Python — não escritas à mão. Planilha montada à mão só testa a suposição de
// quem escreveu o parser; a intenção aqui é bater contra saída de ferramenta
// de verdade, que é o que o cliente vai enviar.
const amostra = (nome: string) => readFileSync(`src/lib/__tests__/fixtures/${nome}`)

describe("decodificação de texto", () => {
  it("remove o BOM que o Excel escreve em 'CSV UTF-8'", () => {
    expect(decodificarTexto(Buffer.from("﻿Nome", "utf8"))).toBe("Nome")
  })

  it("cai pra Windows-1252 quando não é UTF-8 válido", () => {
    // O Excel em português salva assim por padrão. Sem esta detecção, "José"
    // chega no banco como "Jos" + caractere de substituição.
    expect(decodificarTexto(Buffer.from("José", "latin1"))).toBe("José")
  })

  it("mantém UTF-8 sem BOM", () => {
    expect(decodificarTexto(Buffer.from("Ação", "utf8"))).toBe("Ação")
  })
})

describe("separador do CSV", () => {
  it("detecta ponto-e-vírgula (padrão do Excel em português)", () => {
    expect(detectarSeparador("Nome;Email;Telefone")).toBe(";")
  })

  it("detecta vírgula", () => {
    expect(detectarSeparador("Nome,Email,Telefone")).toBe(",")
  })

  it("ignora separador dentro de aspas no cabeçalho", () => {
    // "Nome; Sobrenome" entre aspas é UM cabeçalho, não dois.
    expect(detectarSeparador('"Nome; Sobrenome",Email,Fone')).toBe(",")
  })
})

describe("CSV", () => {
  it("lê o arquivo do Excel-BR: ponto-e-vírgula + Windows-1252", () => {
    const linhas = lerCSV(amostra("clientes-win1252.csv"))
    expect(linhas[0]).toEqual(["Nome", "CPF/CNPJ", "E-mail", "Telefone"])
    expect(linhas[1][0]).toBe("José da Silva")
    // O ponto-e-vírgula dentro das aspas não pode partir o campo.
    expect(linhas[2][0]).toBe("Müller; Irmãos")
    expect(linhas).toHaveLength(3)
  })

  it("lê UTF-8 com BOM, vírgula dentro de aspas, aspas escapadas e quebra de linha", () => {
    const linhas = lerCSV(amostra("clientes-utf8-bom.csv"))
    expect(linhas[0][0]).toBe("Nome") // BOM removido
    expect(linhas[1][0]).toBe("Silva, João")
    expect(linhas[1][2]).toBe("linha 1\nlinha 2")
    expect(linhas[2][0]).toBe('Aspas "duplas"')
  })

  it("aceita a última linha sem quebra no fim do arquivo", () => {
    expect(lerCSV(Buffer.from("a,b\n1,2", "utf8"))).toEqual([["a", "b"], ["1", "2"]])
  })

  it("descarta linhas totalmente vazias", () => {
    // Planilha exportada costuma vir com dezenas de linhas em branco no fim;
    // sem isso cada uma vira um erro de "nome inválido" no relatório.
    expect(lerCSV(Buffer.from("a,b\n1,2\n\n,,\n   \n", "utf8"))).toHaveLength(2)
  })
})

describe("XLSX", () => {
  const linhas = () => lerXLSX(amostra("clientes.xlsx"))

  it("lê o cabeçalho e as linhas", () => {
    expect(linhas()[0]).toEqual(["Nome", "CPF/CNPJ", "E-mail", "Telefone", "Cidade", "Obs"])
    expect(linhas()).toHaveLength(4)
  })

  it("preserva acentos", () => {
    expect(linhas()[1][0]).toBe("José da Silva & Cia")
    expect(linhas()[1][4]).toBe("São Paulo")
  })

  it("decodifica entidades XML no texto", () => {
    // "&" e "<" viram &amp; e &lt; dentro do arquivo; sem decodificar, o nome
    // do cliente chega no banco com a entidade crua.
    expect(linhas()[1][0]).toContain("&")
    expect(linhas()[3][0]).toBe("Carlos <Teste>")
  })

  it("mantém as colunas alinhadas quando uma célula do meio está vazia", () => {
    // Célula vazia é OMITIDA do XML. Lendo em sequência, o telefone da linha 3
    // subiria pra coluna do e-mail — e todo mundo teria o telefone no e-mail.
    const l = linhas()[2]
    expect(l[0]).toBe("Ana Souza")
    expect(l[2]).toBe("") // e-mail ausente
    expect(l[3]).toBe("1133334444") // telefone continua na coluna certa
  })

  it("lê número digitado como número, sem notação científica", () => {
    expect(linhas()[3][3]).toBe("11999998888")
  })

  it("lê apenas a primeira aba", () => {
    // A amostra tem uma segunda aba com "IGNORAR".
    expect(linhas().flat()).not.toContain("IGNORAR")
  })
})

describe("referência de coluna", () => {
  it("converte letra em índice", () => {
    expect(colunaParaIndice("A")).toBe(0)
    expect(colunaParaIndice("Z")).toBe(25)
    expect(colunaParaIndice("AA")).toBe(26)
    expect(colunaParaIndice("AB")).toBe(27)
  })
})

describe("entrada única", () => {
  it("reconhece xlsx pela assinatura mesmo com extensão errada", () => {
    // Renomear .xlsx pra .csv é engano comum; sem olhar a assinatura o parser
    // tentaria ler o zip binário como texto e devolveria lixo.
    expect(lerPlanilha(amostra("clientes.xlsx"), "clientes.csv")).toHaveLength(4)
  })

  it("recusa arquivo vazio", () => {
    expect(() => lerPlanilha(Buffer.alloc(0), "x.csv")).toThrow(PlanilhaInvalida)
  })

  it("recusa .xls antigo com motivo específico", () => {
    // OLE2/BIFF: precisa de mensagem própria, senão o usuário lê
    // "arquivo corrompido" e acha que a planilha dele quebrou.
    const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(20)])
    expect(() => lerPlanilha(ole2, "antigo.xls")).toThrow(
      expect.objectContaining({ motivo: "xlsProtegidoOuAntigo" })
    )
  })

  it("recusa formato desconhecido", () => {
    expect(() => lerPlanilha(Buffer.from("%PDF-1.4"), "doc.pdf")).toThrow(
      expect.objectContaining({ motivo: "formatoNaoSuportado" })
    )
  })

  it("recusa zip corrompido em vez de devolver dados parciais", () => {
    const quebrado = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)])
    expect(() => lerPlanilha(quebrado, "x.xlsx")).toThrow(PlanilhaInvalida)
  })
})
