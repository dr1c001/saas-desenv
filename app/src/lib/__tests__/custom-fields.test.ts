import { describe, expect, it } from "vitest"
import {
  lerOpcoes,
  lerValoresDoFormulario,
  nomeDoInput,
  paraExibicao,
  valorAtual,
  validarDefinicao,
  type DefinicaoCampo,
} from "@/lib/custom-fields"

const campo = (over: Partial<DefinicaoCampo> = {}): DefinicaoCampo => ({
  id: "f1",
  label: "Metragem",
  type: "TEXT",
  options: [],
  required: false,
  ...over,
})

// Simula o FormData: recebe o nome do input, devolve o que foi digitado.
const form = (dados: Record<string, string>) => (nome: string) => dados[nome] ?? null

describe("nome do input", () => {
  it("usa prefixo pra não colidir com campo nativo", () => {
    // Uma empresa que criar um campo chamado "email" não pode sobrescrever o
    // e-mail do cliente ao enviar o formulário.
    expect(nomeDoInput("abc")).toBe("cf_abc")
  })
})

describe("leitura do formulário", () => {
  it("grava o que foi preenchido", () => {
    const r = lerValoresDoFormulario([campo()], form({ cf_f1: "120 m²" }))
    expect(r.valores).toEqual({ f1: "120 m²" })
    expect(r.erros).toEqual([])
  })

  it("ignora campo com id que não existe nas definições", () => {
    // Server Action é endpoint HTTP: dá pra enviar qualquer coisa na mão.
    const r = lerValoresDoFormulario([campo()], form({ cf_f1: "ok", cf_inventado: "x" }))
    expect(r.valores).toEqual({ f1: "ok" })
  })

  it("não guarda chave para campo vazio", () => {
    // Evita acumular string vazia em todo registro do banco.
    const r = lerValoresDoFormulario([campo()], form({ cf_f1: "   " }))
    expect(r.valores).toEqual({})
    expect(r.erros).toEqual([])
  })

  it("cobra o campo marcado como obrigatório", () => {
    const r = lerValoresDoFormulario([campo({ required: true })], form({}))
    expect(r.erros).toEqual([{ fieldId: "f1", label: "Metragem", motivo: "obrigatorio" }])
  })

  it("recusa valor absurdamente longo", () => {
    const r = lerValoresDoFormulario([campo()], form({ cf_f1: "x".repeat(501) }))
    expect(r.erros[0].motivo).toBe("muitoLongo")
    expect(r.valores).toEqual({})
  })

  describe("número", () => {
    const n = campo({ type: "NUMBER" })

    it("aceita vírgula decimal e normaliza pra ponto", () => {
      // É como o brasileiro digita; recusar "1,5" em "metragem" seria
      // incompreensível pra quem está cadastrando.
      expect(lerValoresDoFormulario([n], form({ cf_f1: "1,5" })).valores).toEqual({ f1: "1.5" })
    })

    it("aceita negativo e inteiro", () => {
      expect(lerValoresDoFormulario([n], form({ cf_f1: "-3" })).valores).toEqual({ f1: "-3" })
    })

    it("recusa texto", () => {
      expect(lerValoresDoFormulario([n], form({ cf_f1: "cento e vinte" })).erros[0].motivo).toBe(
        "numeroInvalido"
      )
    })
  })

  describe("data", () => {
    const d = campo({ type: "DATE" })

    it("aceita AAAA-MM-DD", () => {
      expect(lerValoresDoFormulario([d], form({ cf_f1: "2026-08-11" })).valores).toEqual({
        f1: "2026-08-11",
      })
    })

    it("recusa formato solto", () => {
      expect(lerValoresDoFormulario([d], form({ cf_f1: "11/08/2026" })).erros[0].motivo).toBe(
        "dataInvalida"
      )
    })
  })

  describe("lista de opções", () => {
    const s = campo({ type: "SELECT", options: ["Pequeno", "Médio", "Grande"] })

    it("aceita opção da lista", () => {
      expect(lerValoresDoFormulario([s], form({ cf_f1: "Médio" })).valores).toEqual({ f1: "Médio" })
    })

    it("recusa valor fora da lista", () => {
      // Só chega por requisição montada à mão — mas se passasse, ficaria
      // gravado pra sempre num campo que a tela apresenta como fechado.
      expect(lerValoresDoFormulario([s], form({ cf_f1: "Gigante" })).erros[0].motivo).toBe(
        "opcaoInvalida"
      )
    })
  })

  describe("caixa de marcar", () => {
    const c = campo({ type: "CHECKBOX" })

    it("marcada vira true", () => {
      expect(lerValoresDoFormulario([c], form({ cf_f1: "on" })).valores).toEqual({ f1: "true" })
    })

    it("desmarcada não envia nada e não vira erro", () => {
      // Checkbox desmarcado simplesmente não aparece no FormData.
      expect(lerValoresDoFormulario([c], form({}))).toEqual({ valores: {}, erros: [] })
    })
  })
})

describe("exibição", () => {
  it("mostra só o que tem valor", () => {
    const defs = [campo(), campo({ id: "f2", label: "Cor" })]
    expect(paraExibicao(defs, { f1: "120" })).toEqual([
      { label: "Metragem", valor: "120", type: "TEXT" },
    ])
  })

  it("campo apagado some sozinho, mesmo com valor gravado", () => {
    // É o que permite guardar em Json sem deixar dado órfão vazando pra tela.
    expect(paraExibicao([], { f1: "120", f_apagado: "sobra" })).toEqual([])
  })

  it("aguenta Json inesperado sem quebrar a tela", () => {
    // Se algo gravar array ou número por fora, a página do cliente não pode
    // deixar de abrir por causa disso.
    expect(paraExibicao([campo()], null)).toEqual([])
    expect(paraExibicao([campo()], ["a", "b"])).toEqual([])
    expect(paraExibicao([campo()], 42)).toEqual([])
  })

  it("converte número e booleano gravados sem aspas", () => {
    expect(valorAtual({ f1: 120 }, "f1")).toBe("120")
    expect(valorAtual({ f1: true }, "f1")).toBe("true")
  })

  it("devolve vazio pra campo nunca preenchido", () => {
    expect(valorAtual({}, "f1")).toBe("")
  })
})

describe("validação da definição", () => {
  const def = (over = {}) => ({ label: "Metragem", type: "TEXT", options: [], ...over })

  it("aceita definição comum", () => {
    expect(validarDefinicao(def())).toBeNull()
  })

  it("recusa nome curto ou longo demais", () => {
    expect(validarDefinicao(def({ label: "x" }))).toBe("labelCurto")
    expect(validarDefinicao(def({ label: "y".repeat(41) }))).toBe("labelLongo")
  })

  it("recusa tipo desconhecido", () => {
    expect(validarDefinicao(def({ type: "ARQUIVO" }))).toBe("tipoInvalido")
  })

  it("recusa lista fechada sem nenhuma opção", () => {
    // Viraria um campo impossível de preencher.
    expect(validarDefinicao(def({ type: "SELECT" }))).toBe("semOpcoes")
    expect(validarDefinicao(def({ type: "SELECT", options: ["A"] }))).toBeNull()
  })
})

describe("leitura das opções digitadas", () => {
  it("uma por linha, sem vazias nem repetidas", () => {
    expect(lerOpcoes(" Pequeno \n\nMédio\nPequeno\n  \nGrande")).toEqual([
      "Pequeno",
      "Médio",
      "Grande",
    ])
  })

  it("limita a 50", () => {
    expect(lerOpcoes(Array.from({ length: 80 }, (_, i) => `o${i}`).join("\n"))).toHaveLength(50)
  })
})
