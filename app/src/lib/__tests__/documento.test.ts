import { describe, expect, it } from "vitest"
import {
  cnpjValido,
  cpfValido,
  documentoAceitavel,
  formatarDocumento,
  mesmoDocumento,
  somenteDigitos,
} from "@/lib/documento"

// Documentos de teste, todos com dígito verificador correto de verdade.
const CPF_OK = "529.982.247-25"
const CNPJ_OK = "11.222.333/0001-81"

describe("CPF", () => {
  it("aceita o válido, com e sem máscara", () => {
    expect(cpfValido(CPF_OK)).toBe(true)
    expect(cpfValido("52998224725")).toBe(true)
  })

  it("recusa um dígito trocado", () => {
    // O erro de digitação que o dígito verificador existe para pegar: sem isto
    // ele vai parar no boleto e no cadastro do contador, e só aparece semanas
    // depois.
    expect(cpfValido("529.982.247-24")).toBe(false)
  })

  it("RECUSA dígitos repetidos", () => {
    // O defeito clássico de quem implementa o módulo 11 e para por ali:
    // 111.111.111-11 passa na conta e vira um CPF "válido" no cadastro.
    for (const d of ["00000000000", "11111111111", "99999999999"]) {
      expect(cpfValido(d), d).toBe(false)
    }
  })

  it("recusa tamanho errado", () => {
    expect(cpfValido("5299822472")).toBe(false)
    expect(cpfValido("")).toBe(false)
  })
})

describe("CNPJ", () => {
  it("aceita o válido, com e sem máscara", () => {
    expect(cnpjValido(CNPJ_OK)).toBe(true)
    expect(cnpjValido("11222333000181")).toBe(true)
  })

  it("recusa um dígito trocado", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false)
  })

  it("RECUSA dígitos repetidos", () => {
    expect(cnpjValido("00000000000000")).toBe(false)
    expect(cnpjValido("11111111111111")).toBe(false)
  })
})

describe("o que pode ser gravado", () => {
  it("VAZIO passa, porque o campo é opcional", () => {
    // Recusar o vazio transformaria "ainda não tenho os dados do fornecedor"
    // em "não posso cadastrar o fornecedor".
    expect(documentoAceitavel("")).toBe(true)
    expect(documentoAceitavel(null)).toBe(true)
    expect(documentoAceitavel(undefined)).toBe(true)
    expect(documentoAceitavel("   ")).toBe(true)
  })

  it("preenchido e válido passa", () => {
    expect(documentoAceitavel(CPF_OK)).toBe(true)
    expect(documentoAceitavel(CNPJ_OK)).toBe(true)
  })

  it("preenchido e INVÁLIDO não passa", () => {
    // Documento errado é pior que documento em branco: ele parece certo.
    expect(documentoAceitavel("529.982.247-24")).toBe(false)
    expect(documentoAceitavel("11.222.333/0001-82")).toBe(false)
  })

  it("PARCIAL não passa — quase sempre é quem parou de digitar", () => {
    expect(documentoAceitavel("11222333")).toBe(false)
    expect(documentoAceitavel("529982247")).toBe(false)
  })
})

describe("o mesmo fornecedor duas vezes", () => {
  it("compara pelos DÍGITOS, não pelo texto", () => {
    // Sem isto o mesmo CNPJ entra duas vezes — uma com máscara, outra sem — e
    // depois o histórico de compras do fornecedor fica dividido em duas fichas.
    expect(mesmoDocumento("11.222.333/0001-81", "11222333000181")).toBe(true)
    expect(mesmoDocumento("529.982.247-25", "52998224725")).toBe(true)
  })

  it("documentos diferentes não casam", () => {
    expect(mesmoDocumento(CNPJ_OK, "11.222.333/0002-62")).toBe(false)
  })

  it("vazio nunca casa com vazio", () => {
    // Senão dois fornecedores sem documento seriam apontados como duplicata um
    // do outro — e o aviso apareceria em toda empresa que ainda não preencheu.
    expect(mesmoDocumento("", "")).toBe(false)
    expect(mesmoDocumento(null, undefined)).toBe(false)
  })
})

describe("na tela", () => {
  it("põe a máscara do tamanho certo", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25")
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81")
  })

  it("tamanho estranho sai como veio, sem inventar máscara", () => {
    expect(formatarDocumento("123")).toBe("123")
    expect(formatarDocumento("")).toBe("")
  })

  it("só dígitos limpa qualquer pontuação", () => {
    expect(somenteDigitos("11.222.333/0001-81")).toBe("11222333000181")
    expect(somenteDigitos("abc")).toBe("")
  })
})
