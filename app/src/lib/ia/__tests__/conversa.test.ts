import { describe, expect, it } from "vitest"
import { VOCABULARIO_PADRAO } from "@/lib/vocabulario"
import {
  comoFerramentasDaApi,
  comoResultado,
  decidir,
  instrucoes,
  MAX_VOLTAS,
  type BlocoDaResposta,
} from "@/lib/ia/conversa"
import { ferramentaChamada, ferramentasPara, FERRAMENTAS } from "@/lib/ia/ferramentas"
import { ACOES } from "@/lib/acoes"

const contexto = {
  nome: "Beto",
  papel: "TECHNICIAN",
  hoje: "2026-08-23",
  vocabulario: VOCABULARIO_PADRAO.pt,
}

function texto(t: string): BlocoDaResposta[] {
  return [{ type: "text", text: t }]
}
function usa(nome: string, input: unknown = {}): BlocoDaResposta[] {
  return [{ type: "tool_use", id: "tu_1", name: nome, input }]
}

describe("o que a assistente decide fazer", () => {
  const doAdmin = ferramentasPara(true, ACOES)

  it("sem ferramenta pedida, só responde", () => {
    expect(decidir(texto("Você tem 3 hoje."), doAdmin)).toEqual({
      tipo: "responder",
      texto: "Você tem 3 hoje.",
    })
  })

  it("leitura executa direto", () => {
    const d = decidir(usa("listar_ordens", { status: "OPEN" }), doAdmin)
    expect(d.tipo).toBe("executar")
  })

  it("o irreversível PARA para alguém confirmar", () => {
    // O teste central desta camada. Se algum dia isto virar "executar", a
    // assistente passa a apagar OS por causa de fala mal ouvida.
    expect(decidir(usa("excluir_ordem", { numero: "24" }), doAdmin).tipo).toBe("confirmar")
    expect(decidir(usa("emitir_nota_fiscal", { numero: "24" }), doAdmin).tipo).toBe("confirmar")
    expect(decidir(usa("concluir_ordem", { numero: "24" }), doAdmin).tipo).toBe("confirmar")
  })

  it("ferramenta fora da lista da pessoa é NEGADA, não executada", () => {
    // Um técnico não tem emitir_nota_fiscal. O modelo pode pedir assim mesmo —
    // por confusão, ou porque alguém adulterou o histórico devolvido pelo
    // navegador. A lista de quem pode o quê é conferida deste lado.
    const doTecnico = ferramentasPara(false, ACOES)
    const d = decidir(usa("emitir_nota_fiscal", { numero: "24" }), doTecnico)
    expect(d.tipo).toBe("negada")
  })

  it("nome de ferramenta inventado é negado", () => {
    expect(decidir(usa("apagar_o_banco"), doAdmin).tipo).toBe("negada")
  })

  it("input ausente vira objeto vazio, e não quebra", () => {
    const d = decidir([{ type: "tool_use", id: "x", name: "listar_ordens", input: null }], doAdmin)
    expect(d.tipo).toBe("executar")
    if (d.tipo === "executar") expect(d.args).toEqual({})
  })

  it("junta o texto quando vem em vários blocos", () => {
    const d = decidir([...texto("Primeira."), ...texto("Segunda.")], doAdmin)
    expect(d).toEqual({ tipo: "responder", texto: "Primeira.\nSegunda." })
  })
})

describe("as instruções da assistente", () => {
  it("diz o dia de hoje", () => {
    // Sem a data, o modelo não resolve "amanhã" — e chutar data de agendamento
    // é erro que só aparece quando o cliente reclama que ninguém foi.
    expect(instrucoes(contexto)).toContain("2026-08-23")
  })

  it("usa o vocabulário DA EMPRESA", () => {
    const chamado = {
      ...contexto,
      vocabulario: {
        os: { curto: "Chamado", singular: "chamado", plural: "chamados", genero: "m" as const },
        tec: {
          curto: "Instalador",
          singular: "instalador",
          plural: "instaladores",
          genero: "m" as const,
        },
      },
    }
    const i = instrucoes(chamado)
    expect(i).toContain("chamado")
    expect(i).toContain("instalador")
    expect(i).not.toContain("ordem de serviço")
  })

  it("proíbe inventar dado e proíbe dizer que fez o que não fez", () => {
    const i = instrucoes(contexto)
    expect(i).toContain("Nunca invente dado")
    expect(i).toContain("Nunca diga que fez algo que você não fez")
  })

  it("manda perguntar em vez de adivinhar qual registro", () => {
    expect(instrucoes(contexto)).toContain("PERGUNTE qual")
  })

  it("proíbe pedir ou repetir senha", () => {
    expect(instrucoes(contexto).toLowerCase()).toContain("senha")
  })

  it("chama a pessoa pelo nome", () => {
    expect(instrucoes(contexto)).toContain("Beto")
  })
})

describe("o formato que vai para a API", () => {
  it("converte toda ferramenta sem perder nada", () => {
    const api = comoFerramentasDaApi(FERRAMENTAS)
    expect(api.length).toBe(FERRAMENTAS.length)
    for (const f of api) {
      expect(f.name).toBeTruthy()
      expect(f.description).toBeTruthy()
      expect(f.input_schema.type).toBe("object")
    }
  })

  it("o nome que vai é o mesmo que volta", () => {
    // Se o nome divergisse, toda chamada do modelo cairia em "negada".
    for (const f of comoFerramentasDaApi(FERRAMENTAS)) {
      expect(ferramentaChamada(f.name), f.name).not.toBeNull()
    }
  })

  it("marca o resultado com erro quando falha", () => {
    expect(comoResultado("tu_1", "não achei", true)).toEqual({
      type: "tool_result",
      tool_use_id: "tu_1",
      content: "não achei",
      is_error: true,
    })
    expect(comoResultado("tu_1", "ok")).not.toHaveProperty("is_error")
  })
})

describe("o teto de idas e voltas", () => {
  it("existe e é pequeno", () => {
    // Sem teto, uma ferramenta devolvendo algo inesperado deixa o modelo
    // girando — e cada volta é dinheiro.
    expect(MAX_VOLTAS).toBeGreaterThan(1)
    expect(MAX_VOLTAS).toBeLessThanOrEqual(10)
  })
})
