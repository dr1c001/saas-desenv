import { describe, expect, it } from "vitest"
import {
  aceitaPreco,
  compararCotacao,
  melhorPorItem,
  podeFecharCom,
  totaisPorFornecedor,
  type ItemCotado,
  type Participante,
  type PrecoCotado,
} from "@/lib/cotacao"

// A comparação da cotação.
//
// É a parte do módulo em que um erro custa dinheiro de verdade: apontar o
// fornecedor errado como mais barato faz a empresa comprar mais caro achando
// que economizou. Por isso o teste cobre o cenário completo e cada borda
// separadamente.

const itens: ItemCotado[] = [
  { id: "i1", partId: "p1", nome: "Compressor", quantidade: 2 },
  { id: "i2", partId: "p2", nome: "Filtro", quantidade: 10 },
  { id: "i3", partId: "p3", nome: "Gás", quantidade: 1 },
]

const forn: Participante[] = [
  { id: "a", supplierId: "s1", nome: "Frio Total" },
  { id: "b", supplierId: "s2", nome: "Distribuidora Polar" },
  { id: "c", supplierId: "s3", nome: "Refrisul" },
]

/** Preços: A é o melhor no total; B ganha no filtro; C não cotou tudo. */
const precos: PrecoCotado[] = [
  { participantId: "a", itemId: "i1", unitPrice: 900 },
  { participantId: "a", itemId: "i2", unitPrice: 30 },
  { participantId: "a", itemId: "i3", unitPrice: 400 },
  { participantId: "b", itemId: "i1", unitPrice: 950 },
  { participantId: "b", itemId: "i2", unitPrice: 22 },
  { participantId: "b", itemId: "i3", unitPrice: 420 },
  { participantId: "c", itemId: "i1", unitPrice: 880 },
  // C não cotou i2 nem i3.
]

describe("o melhor preço de cada item", () => {
  it("aponta quem está mais barato, item a item", () => {
    const r = melhorPorItem(itens, forn, precos)
    expect(r.map((x) => x.nomeDoFornecedor)).toEqual([
      "Refrisul", // 880 < 900 < 950
      "Distribuidora Polar", // 22 < 30
      "Frio Total", // 400 < 420
    ])
  })

  it("multiplica pela quantidade", () => {
    const r = melhorPorItem(itens, forn, precos)
    expect(r[0].total).toBe(1760) // 880 × 2
    expect(r[1].total).toBe(220) // 22 × 10
  })

  it("conta quantos cotaram cada item", () => {
    // Item que só um cotou é item sem concorrência — e o dono precisa saber
    // disso antes de aceitar o preço.
    const r = melhorPorItem(itens, forn, precos)
    expect(r.map((x) => x.quantosCotaram)).toEqual([3, 2, 2])
  })

  it("item que NINGUÉM cotou volta com null, e não some", () => {
    // Sumir esconderia justamente o que precisa de outra ligação.
    const soloItem: ItemCotado[] = [{ id: "z", partId: "pz", nome: "Válvula", quantidade: 1 }]
    const r = melhorPorItem(soloItem, forn, precos)
    expect(r).toHaveLength(1)
    expect(r[0].participantId).toBeNull()
    expect(r[0].total).toBeNull()
    expect(r[0].quantosCotaram).toBe(0)
  })

  it("empate fica com o PRIMEIRO da lista", () => {
    // Determinístico de propósito: uma comparação que troca de vencedor a cada
    // recarregamento faz quem decide desconfiar da tela inteira.
    const empate: PrecoCotado[] = [
      { participantId: "a", itemId: "i1", unitPrice: 900 },
      { participantId: "b", itemId: "i1", unitPrice: 900 },
    ]
    const r = melhorPorItem([itens[0]], forn, empate)
    expect(r[0].participantId).toBe("a")
  })

  it("preço ZERO é válido, e ganha", () => {
    // Brinde e bonificação existem. Tratar zero como "não cotou" faria o
    // sistema ignorar o melhor preço possível.
    const comBrinde: PrecoCotado[] = [
      { participantId: "a", itemId: "i1", unitPrice: 900 },
      { participantId: "b", itemId: "i1", unitPrice: 0 },
    ]
    const r = melhorPorItem([itens[0]], forn, comBrinde)
    expect(r[0].participantId).toBe("b")
    expect(r[0].total).toBe(0)
  })
})

describe("o total de cada fornecedor", () => {
  it("soma quantidade × preço", () => {
    const r = totaisPorFornecedor(itens, forn, precos)
    // A: 900×2 + 30×10 + 400×1 = 1800 + 300 + 400
    expect(r.find((x) => x.participante.id === "a")!.total).toBe(2500)
    // B: 950×2 + 22×10 + 420×1 = 1900 + 220 + 420
    expect(r.find((x) => x.participante.id === "b")!.total).toBe(2540)
  })

  it("marca quem cotou TUDO", () => {
    const r = totaisPorFornecedor(itens, forn, precos)
    expect(r.map((x) => x.completo)).toEqual([true, true, false])
  })

  it("conta o que falta cotar", () => {
    const c = totaisPorFornecedor(itens, forn, precos).find((x) => x.participante.id === "c")!
    expect(c.cotados).toBe(1)
    expect(c.faltando).toBe(2)
  })

  it("quem não cotou nada tem total zero e não é completo", () => {
    const vazio = totaisPorFornecedor(itens, [{ id: "z", supplierId: "sz", nome: "Sumido" }], [])
    expect(vazio[0].total).toBe(0)
    expect(vazio[0].completo).toBe(false)
    expect(vazio[0].cotados).toBe(0)
  })
})

describe("a comparação completa", () => {
  const c = compararCotacao(itens, forn, precos)

  it("o melhor fornecedor único é o de menor total ENTRE OS COMPLETOS", () => {
    // O teste que impede o erro mais caro deste módulo: comparar o total de
    // quem cotou 1 de 3 itens contra quem cotou os 3 daria a vitória a quem
    // respondeu menos. A Refrisul soma só R$ 1.760 e NÃO pode ganhar.
    expect(c.melhorUnico?.participante.nome).toBe("Frio Total")
    expect(c.melhorUnico?.total).toBe(2500)
  })

  it("o total dividindo é a soma dos melhores por item", () => {
    // 880×2 + 22×10 + 400×1 = 1760 + 220 + 400
    expect(c.totalDividindo).toBe(2380)
  })

  it("a economia é a diferença entre os dois caminhos", () => {
    expect(c.economiaAoDividir).toBe(120) // 2500 − 2380
  })

  it("dividir nunca custa mais que o melhor único", () => {
    // Propriedade matemática: o melhor de cada item é, por definição, menor ou
    // igual ao preço daquele item em qualquer fornecedor. Se este teste
    // falhar, a comparação está errada em algum lugar.
    expect(c.totalDividindo).toBeLessThanOrEqual(c.melhorUnico!.total)
    expect(c.economiaAoDividir!).toBeGreaterThanOrEqual(0)
  })

  it("lista os itens que ninguém cotou", () => {
    const comOrfao = compararCotacao(
      [...itens, { id: "i4", partId: "p4", nome: "Válvula", quantidade: 1 }],
      forn,
      precos
    )
    expect(comOrfao.semCotacao.map((i) => i.nome)).toEqual(["Válvula"])
  })

  it("sem NINGUÉM completo, não há fornecedor único nem economia", () => {
    // Sem base de comparação, qualquer número de economia seria inventado.
    const soParcial = compararCotacao(itens, [forn[2]], precos)
    expect(soParcial.melhorUnico).toBeNull()
    expect(soParcial.economiaAoDividir).toBeNull()
    // Mas o que foi cotado continua somando.
    expect(soParcial.totalDividindo).toBe(1760)
  })

  it("cotação sem preço nenhum não quebra", () => {
    const vazia = compararCotacao(itens, forn, [])
    expect(vazia.melhorUnico).toBeNull()
    expect(vazia.totalDividindo).toBe(0)
    expect(vazia.semCotacao).toHaveLength(3)
  })

  it("cotação sem itens não quebra", () => {
    const semItens = compararCotacao([], forn, [])
    expect(semItens.porItem).toEqual([])
    // Sem item nenhum, ninguém é "completo" — senão todos empatariam em zero.
    expect(semItens.melhorUnico).toBeNull()
  })
})

describe("fechar a cotação", () => {
  const totais = totaisPorFornecedor(itens, forn, precos)

  it("dá para fechar com quem cotou alguma coisa", () => {
    expect(podeFecharCom(totais, "a")).toBe(true)
    // Mesmo parcial: a empresa pode querer comprar só o que ele cotou.
    expect(podeFecharCom(totais, "c")).toBe(true)
  })

  it("NÃO dá para fechar com quem não respondeu", () => {
    // Geraria uma ordem de compra vazia, e o dono descobriria só na tela
    // seguinte.
    const semResposta = totaisPorFornecedor(itens, [{ id: "z", supplierId: "sz", nome: "Sumido" }], [])
    expect(podeFecharCom(semResposta, "z")).toBe(false)
  })

  it("participante desconhecido não fecha", () => {
    expect(podeFecharCom(totais, "nao-existe")).toBe(false)
  })
})

describe("quando a cotação aceita preço", () => {
  it("só aberta", () => {
    expect(aceitaPreco("ABERTA")).toBe(true)
    expect(aceitaPreco("FECHADA")).toBe(false)
    expect(aceitaPreco("CANCELADA")).toBe(false)
  })
})

describe("dinheiro fecha em centavos", () => {
  it("preço quebrado não gera dízima no total", () => {
    // 0,1 × 3 em float puro dá 0.30000000000000004, e o total da tela passaria
    // a mostrar um centésimo de centavo.
    const r = totaisPorFornecedor(
      [{ id: "x", partId: "px", nome: "Parafuso", quantidade: 3 }],
      [forn[0]],
      [{ participantId: "a", itemId: "x", unitPrice: 0.1 }]
    )
    expect(r[0].total).toBe(0.3)
  })
})

describe("os defeitos que a revisão adversarial achou", () => {
  // Escrito depois de uma revisão que encontrou os dois lados do mesmo erro:
  // havia DUAS convenções de arredondamento no módulo. `totaisPorFornecedor`
  // somava cru e arredondava uma vez; `melhorPorItem` arredondava por linha.
  //
  // Com quantidade fracionária — e a coluna é Decimal(12,3), o formulário
  // aceita 0,001 — os dois divergem, e a tela chegava a mostrar "dividindo"
  // MAIS CARO que o melhor fornecedor único. Isso é impossível por definição,
  // porque o melhor de cada item é, por construção, menor ou igual ao preço
  // daquele item em qualquer fornecedor.

  const fracionarios: ItemCotado[] = [
    { id: "f1", partId: "p1", nome: "Cabo", quantidade: 2.5 },
    { id: "f2", partId: "p2", nome: "Fita", quantidade: 1.5 },
    { id: "f3", partId: "p3", nome: "Massa", quantidade: 0.5 },
  ]
  const umSo: Participante[] = [{ id: "u", supplierId: "s", nome: "Único" }]
  const precosQuebrados: PrecoCotado[] = [
    { participantId: "u", itemId: "f1", unitPrice: 3.45 },
    { participantId: "u", itemId: "f2", unitPrice: 7.15 },
    { participantId: "u", itemId: "f3", unitPrice: 9.99 },
  ]

  it("com UM fornecedor, dividir custa EXATAMENTE o mesmo", () => {
    // O caso mais simples possível, e o que denunciava o defeito: havendo um
    // fornecedor só, os dois caminhos são o mesmo dinheiro. Divergir aqui é
    // aritmética errada, não estratégia de compra.
    const c = compararCotacao(fracionarios, umSo, precosQuebrados)
    expect(c.totalDividindo).toBe(c.melhorUnico!.total)
    expect(c.economiaAoDividir).toBe(0)
  })

  it("a economia NUNCA é negativa, com quantidade quebrada", () => {
    const c = compararCotacao(fracionarios, umSo, precosQuebrados)
    expect(c.economiaAoDividir!).toBeGreaterThanOrEqual(0)
  })

  it("o total é a soma das linhas ARREDONDADAS, como na nota fiscal", () => {
    // 2,5×3,45=8,625→8,63 · 1,5×7,15=10,725→10,73 · 0,5×9,99=4,995→5,00
    const [t] = totaisPorFornecedor(fracionarios, umSo, precosQuebrados)
    expect(t.total).toBe(24.36)
  })

  it("o total do fornecedor bate com a soma dos totais por item", () => {
    // A invariante que liga a tabela ao card, e o card à ordem de compra que
    // o fechamento grava. Se estes três divergirem, o dono aprova um número e
    // o sistema compra por outro.
    const porItem = melhorPorItem(fracionarios, umSo, precosQuebrados)
    const [total] = totaisPorFornecedor(fracionarios, umSo, precosQuebrados)
    const somaDosItens = Math.round(porItem.reduce((s, i) => s + (i.total ?? 0), 0) * 100) / 100
    expect(somaDosItens).toBe(total.total)
  })

  it("vale para vários conjuntos de quantidade quebrada", () => {
    // Varredura: o defeito só aparecia com certas combinações, e um caso único
    // teria passado por sorte.
    const quantidades = [0.333, 1.5, 2.25, 7.777, 0.001]
    const precos = [1.99, 3.45, 12.34, 0.07, 999.99]
    for (const q of quantidades) {
      for (const p of precos) {
        const item: ItemCotado[] = [{ id: "x", partId: "px", nome: "X", quantidade: q }]
        const c = compararCotacao(item, umSo, [
          { participantId: "u", itemId: "x", unitPrice: p },
        ])
        expect(c.economiaAoDividir, `q=${q} p=${p}`).toBe(0)
      }
    }
  })
})
