import { describe, expect, it } from "vitest"
import {
  decidir,
  estaTravada,
  novaOperacao,
  ordenar,
  paraEnviar,
  resumir,
  MAX_TENTATIVAS,
  type Operacao,
} from "@/lib/fila-offline"

const op = (p: Partial<Operacao> = {}): Operacao => ({
  id: "a",
  tipo: "CONCLUIR_OS",
  orderId: "os1",
  criadaEm: 1000,
  tentativas: 0,
  ultimoErro: null,
  dados: {},
  ...p,
})

describe("o que fazer com o veredito", () => {
  it("aplicada sai da fila", () => {
    expect(decidir({ estado: "aplicada" }, 0)).toBe("remover")
  })

  it("repetida também sai — repetição não é erro", () => {
    // A resposta pode ter se perdido no caminho DEPOIS de o servidor aplicar.
    // Tratar a repetição como erro faria a fila nunca esvaziar.
    expect(decidir({ estado: "repetida" }, 3)).toBe("remover")
  })

  it("recusada trava em vez de insistir", () => {
    // Insistir numa recusa por regra de negócio é gastar bateria pra receber
    // o mesmo não. Mas trava visível, não some: a pessoa precisa saber.
    expect(decidir({ estado: "recusada", motivo: "já concluída" }, 0)).toBe("travar")
  })

  it("falha de rede vale tentar de novo", () => {
    expect(decidir({ estado: "falhou", motivo: "sem rede" }, 0)).toBe("manter")
    expect(decidir({ estado: "falhou", motivo: "sem rede" }, MAX_TENTATIVAS - 2)).toBe("manter")
  })

  it("mas para depois do teto de tentativas", () => {
    expect(decidir({ estado: "falhou", motivo: "timeout" }, MAX_TENTATIVAS - 1)).toBe("travar")
  })
})

describe("ordem de envio", () => {
  it("mais antiga primeiro", () => {
    // Se o técnico marcou "em andamento" e depois concluiu, mandar ao
    // contrário faria a OS terminar "em andamento" — o último a chegar vence
    // no servidor.
    const ops = [op({ id: "b", criadaEm: 2000 }), op({ id: "a", criadaEm: 1000 })]
    expect(ordenar(ops).map((o) => o.id)).toEqual(["a", "b"])
  })

  it("empate no mesmo milissegundo tem ordem estável", () => {
    const ops = [op({ id: "z", criadaEm: 1000 }), op({ id: "a", criadaEm: 1000 })]
    expect(ordenar(ops).map((o) => o.id)).toEqual(["a", "z"])
    expect(ordenar(ops)).toEqual(ordenar([...ops].reverse()))
  })

  it("não modifica a lista recebida", () => {
    const ops = [op({ id: "b", criadaEm: 2000 }), op({ id: "a", criadaEm: 1000 })]
    ordenar(ops)
    expect(ops[0].id).toBe("b")
  })
})

describe("o que vale enviar agora", () => {
  it("deixa a travada de fora", () => {
    const ops = [op({ id: "ok" }), op({ id: "travada", tentativas: MAX_TENTATIVAS })]
    expect(paraEnviar(ops).map((o) => o.id)).toEqual(["ok"])
  })

  it("travada continua na fila, só não é enviada", () => {
    // Some sozinha seria perder trabalho em silêncio — exatamente o que esta
    // fila existe pra impedir.
    const ops = [op({ id: "travada", tentativas: MAX_TENTATIVAS })]
    expect(resumir(ops).total).toBe(1)
    expect(paraEnviar(ops)).toEqual([])
  })

  it("fila vazia não quebra", () => {
    expect(paraEnviar([])).toEqual([])
    expect(resumir([])).toEqual({ pendentes: 0, travadas: 0, total: 0 })
  })
})

describe("resumo pra tela", () => {
  it("separa pendente de travada", () => {
    const ops = [
      op({ id: "1" }),
      op({ id: "2", tentativas: 2 }),
      op({ id: "3", tentativas: MAX_TENTATIVAS }),
    ]
    expect(resumir(ops)).toEqual({ pendentes: 2, travadas: 1, total: 3 })
  })

  it("tentativa parcial ainda é pendente, não travada", () => {
    expect(estaTravada(op({ tentativas: MAX_TENTATIVAS - 1 }))).toBe(false)
    expect(estaTravada(op({ tentativas: MAX_TENTATIVAS }))).toBe(true)
  })
})

describe("operação nova", () => {
  it("guarda o momento do TÉCNICO, não o da sincronização", () => {
    // A OS precisa registrar quando o serviço foi concluído no mundo real, e
    // não quando o celular reencontrou sinal — que pode ser dias depois.
    const o = novaOperacao("CONCLUIR_OS", "os1", { conclusionNote: "pronto" }, "uuid-1", 1234)
    expect(o.criadaEm).toBe(1234)
    expect(o.tentativas).toBe(0)
    expect(o.id).toBe("uuid-1")
    expect(o.dados.conclusionNote).toBe("pronto")
  })
})
