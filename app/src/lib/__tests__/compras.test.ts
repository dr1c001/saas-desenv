import { describe, expect, it } from "vitest"
import {
  estaPendente,
  faltaReceber,
  podeCancelar,
  statusAposRecebimento,
  totalDaCompra,
} from "@/lib/compras"

describe("status após recebimento", () => {
  it("tudo completo vira RECEBIDA", () => {
    expect(
      statusAposRecebimento([
        { pedido: 10, recebido: 10 },
        { pedido: 5, recebido: 5 },
      ])
    ).toBe("RECEBIDA")
  })

  it("um item faltando mantém PARCIAL", () => {
    // Entrega parcial é a regra, não a exceção. Sistema que só aceita "tudo
    // ou nada" faz a empresa parar de registrar.
    expect(
      statusAposRecebimento([
        { pedido: 10, recebido: 8 },
        { pedido: 5, recebido: 5 },
      ])
    ).toBe("PARCIAL")
  })

  it("nada chegou continua ENVIADA", () => {
    expect(
      statusAposRecebimento([
        { pedido: 10, recebido: 0 },
        { pedido: 5, recebido: 0 },
      ])
    ).toBe("ENVIADA")
  })

  it("recebido a mais conta como completo", () => {
    // O fornecedor mandou sobrando. Ficar eternamente "parcial" por isso
    // seria absurdo, e a compra nunca sairia da lista de pendências.
    expect(statusAposRecebimento([{ pedido: 10, recebido: 12 }])).toBe("RECEBIDA")
  })

  it("compra sem item nenhum não vira recebida por vacuidade", () => {
    // `every` de lista vazia é true — sem esta guarda, uma compra vazia
    // apareceria como totalmente entregue.
    expect(statusAposRecebimento([])).toBe("ENVIADA")
  })
})

describe("o que falta chegar", () => {
  it("calcula a diferença", () => {
    expect(faltaReceber({ pedido: 10, recebido: 4 })).toBe(6)
  })

  it("nunca é negativo quando chega a mais", () => {
    expect(faltaReceber({ pedido: 10, recebido: 12 })).toBe(0)
  })

  it("aguenta fração sem lixo binário", () => {
    expect(faltaReceber({ pedido: 1, recebido: 0.7 })).toBe(0.3)
  })
})

describe("cancelamento", () => {
  it("só antes de qualquer entrada de estoque", () => {
    expect(podeCancelar("RASCUNHO")).toBe(true)
    expect(podeCancelar("ENVIADA")).toBe(true)
  })

  it("recebida ou parcial não cancela", () => {
    // O estoque já entrou; desfazer daqui deixaria saldo e histórico
    // discordando. Devolver ao fornecedor é um movimento de saída.
    expect(podeCancelar("PARCIAL")).toBe(false)
    expect(podeCancelar("RECEBIDA")).toBe(false)
    expect(podeCancelar("CANCELADA")).toBe(false)
  })
})

describe("pendência", () => {
  it("enviada e parcial ainda esperam entrega", () => {
    expect(estaPendente("ENVIADA")).toBe(true)
    expect(estaPendente("PARCIAL")).toBe(true)
  })

  it("recebida, cancelada e rascunho não cobram o fornecedor", () => {
    expect(estaPendente("RECEBIDA")).toBe(false)
    expect(estaPendente("CANCELADA")).toBe(false)
    expect(estaPendente("RASCUNHO")).toBe(false)
  })
})

describe("total", () => {
  it("soma quantidade × custo", () => {
    expect(
      totalDaCompra([
        { quantity: 10, unitCost: 2.5 },
        { quantity: 3, unitCost: 10 },
      ])
    ).toBe(55)
  })

  it("arredonda em duas casas, sem lixo de ponto flutuante", () => {
    expect(totalDaCompra([{ quantity: 3, unitCost: 0.1 }])).toBe(0.3)
  })

  it("compra vazia soma zero", () => {
    expect(totalDaCompra([])).toBe(0)
  })
})
