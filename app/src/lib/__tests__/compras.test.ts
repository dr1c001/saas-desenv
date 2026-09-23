import { describe, expect, it } from "vitest"
import {
  custoDoRecebimento,
  estaPendente,
  faltaReceber,
  itensSemCusto,
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

describe("o custo que vale no recebimento", () => {
  it("linha ZERADA usa o custo informado na hora de receber", () => {
    // "Comprar o que falta" gera a ordem com o último custo conhecido da peça,
    // e peça nunca comprada não tem custo — a linha nascia R$ 0,00. Receber
    // assim derrubava o custo médio E não criava despesa: a peça entrava no
    // estoque e o dinheiro não saía do caixa.
    expect(custoDoRecebimento(0, 42.5)).toBe(42.5)
  })

  it("custo JÁ GRAVADO nunca é sobrescrito pelo campo de recebimento", () => {
    // Quem digitou o preço ao criar a compra não pode vê-lo trocado por um
    // campo de outra tela — seria perder o número conferido com o fornecedor.
    expect(custoDoRecebimento(80, 999)).toBe(80)
    expect(custoDoRecebimento(80, null)).toBe(80)
  })

  it("sem nenhum dos dois, devolve ZERO — e a Action recusa", () => {
    // Devolver zero é honesto. Inventar um custo aqui esconderia o problema em
    // vez de mandar a pessoa buscar a nota do fornecedor.
    expect(custoDoRecebimento(0, null)).toBe(0)
    expect(custoDoRecebimento(0, 0)).toBe(0)
    expect(custoDoRecebimento(0, -5)).toBe(0)
  })
})

describe("quem está sem preço", () => {
  it("devolve os NOMES, e não um sim ou não", () => {
    // A tela precisa dizer QUAL item está sem preço; "esta compra tem item sem
    // custo" manda a pessoa procurar linha por linha.
    expect(
      itensSemCusto([
        { nome: "Compressor", custo: 900 },
        { nome: "Filtro", custo: 0 },
        { nome: "Gás", custo: 300 },
      ])
    ).toEqual(["Filtro"])
  })

  it("lista sem buracos devolve vazio", () => {
    expect(itensSemCusto([{ nome: "Compressor", custo: 900 }])).toEqual([])
  })
})
