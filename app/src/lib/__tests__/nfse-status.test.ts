import { describe, expect, it } from "vitest"
import {
  devePerguntar,
  estadoDaNota,
  estadoDesconhecido,
  estadoFinal,
  MAX_CONSULTAS,
} from "@/lib/nfse-status"

// Documento fiscal. Concluir errado aqui significa dizer que existe uma nota
// que não existe — ou o contrário. As duas versões são caras, e nenhuma dá
// erro em lugar nenhum.

describe("o que cada estado do emissor significa", () => {
  it("reconhece nota emitida", () => {
    expect(estadoDaNota("Issued")).toBe("emitida")
    expect(estadoDaNota("Done")).toBe("emitida")
  })

  it("reconhece nota recusada pela prefeitura", () => {
    expect(estadoDaNota("IssueFailed")).toBe("rejeitada")
    expect(estadoDaNota("Error")).toBe("rejeitada")
  })

  it("distingue cancelada de rejeitada", () => {
    // Cancelada existiu e foi desfeita; rejeitada nunca existiu. Tratar as
    // duas igual esconderia que houve uma nota válida no meio.
    expect(estadoDaNota("Cancelled")).toBe("cancelada")
    expect(estadoDaNota("Cancelled")).not.toBe(estadoDaNota("IssueFailed"))
  })

  it("os nomes de espera continuam pendentes", () => {
    for (const s of ["Processing", "WaitingSend", "WaitingReturn", "WaitingCalculateTaxes"]) {
      expect(estadoDaNota(s), s).toBe("pendente")
    }
  })

  it("não se importa com caixa, acento ou pontuação", () => {
    // O emissor pode mudar a grafia sem avisar, e um estado final lido como
    // pendente faria o sistema perguntar para sempre.
    expect(estadoDaNota("ISSUED")).toBe("emitida")
    expect(estadoDaNota("issue_failed")).toBe("rejeitada")
    expect(estadoDaNota(" Issued ")).toBe("emitida")
  })

  it("vazio é pendente, não erro", () => {
    expect(estadoDaNota(null)).toBe("pendente")
    expect(estadoDaNota(undefined)).toBe("pendente")
    expect(estadoDaNota("")).toBe("pendente")
  })
})

describe("nome que o código não conhece", () => {
  it("NÃO vira 'emitida' nem 'rejeitada'", () => {
    // A direção segura: continuar perguntando custa uma chamada; concluir
    // errado sobre documento fiscal custa a nota.
    expect(estadoDaNota("EstadoQueNinguemViu")).toBe("pendente")
  })

  it("é sinalizado para a lista crescer com base no que acontece", () => {
    expect(estadoDesconhecido("EstadoQueNinguemViu")).toBe(true)
    // Espera conhecida não é "desconhecida" — não polui o log todo dia.
    expect(estadoDesconhecido("Processing")).toBe(false)
    expect(estadoDesconhecido("Issued")).toBe(false)
    expect(estadoDesconhecido(null)).toBe(false)
  })
})

describe("quando parar de perguntar", () => {
  it("estado final não é consultado de novo", () => {
    expect(estadoFinal("emitida")).toBe(true)
    expect(estadoFinal("rejeitada")).toBe(true)
    expect(estadoFinal("cancelada")).toBe(true)
    expect(estadoFinal("pendente")).toBe(false)
  })

  it("pendente é perguntado até o teto", () => {
    expect(devePerguntar("pendente", 0)).toBe(true)
    expect(devePerguntar("pendente", MAX_CONSULTAS - 1)).toBe(true)
  })

  it("desiste depois do teto — nota parada precisa de gente, não de consulta", () => {
    expect(devePerguntar("pendente", MAX_CONSULTAS)).toBe(false)
    expect(devePerguntar("pendente", MAX_CONSULTAS + 10)).toBe(false)
  })

  it("estado final nunca é perguntado, mesmo com o contador zerado", () => {
    expect(devePerguntar("emitida", 0)).toBe(false)
  })
})
