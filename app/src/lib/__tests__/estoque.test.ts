import { describe, expect, it } from "vitest"
import {
  abaixoDoMinimo,
  precisaRepor,
  quantoRepor,
  estaNegativo,
  quantidadeValida,
  saldoApos,
  situacaoDa,
  unidadeValida,
  variacaoDo,
} from "@/lib/estoque"

describe("saldo após um movimento", () => {
  it("entrada soma", () => {
    expect(saldoApos(10, "ENTRADA", 5)).toBe(15)
  })

  it("saída subtrai", () => {
    expect(saldoApos(10, "SAIDA", 4)).toBe(6)
  })

  it("ajuste DEFINE o valor, não soma", () => {
    // É a diferença que mais confunde: quem conta a prateleira e acha 7 quer
    // que fique 7, não que some 7 ao que o sistema achava que tinha.
    expect(saldoApos(10, "AJUSTE", 7)).toBe(7)
    expect(saldoApos(2, "AJUSTE", 7)).toBe(7)
    expect(saldoApos(10, "AJUSTE", 0)).toBe(0)
  })

  it("saída além do saldo deixa negativo em vez de recusar", () => {
    // O serviço aconteceu no mundo real. Recusar o registro porque o cadastro
    // estava desatualizado só faz a empresa parar de registrar.
    expect(saldoApos(2, "SAIDA", 5)).toBe(-3)
  })

  it("não carrega lixo de ponto flutuante", () => {
    // 0.1 somado três vezes dá 0.30000000000000004 sem arredondar, e esse
    // lixo apareceria na tela do cliente.
    let s = 0
    for (let i = 0; i < 3; i++) s = saldoApos(s, "ENTRADA", 0.1)
    expect(s).toBe(0.3)
  })
})

describe("variação registrada no histórico", () => {
  it("entrada é positiva, saída é negativa", () => {
    expect(variacaoDo(10, "ENTRADA", 5)).toBe(5)
    expect(variacaoDo(10, "SAIDA", 4)).toBe(-4)
  })

  it("ajuste registra a DIFERENÇA, não o valor final", () => {
    // "ajustado para 7" sem dizer de quanto veio não explica nada a quem lê
    // o histórico depois.
    expect(variacaoDo(10, "AJUSTE", 7)).toBe(-3)
    expect(variacaoDo(2, "AJUSTE", 7)).toBe(5)
  })

  it("a soma das variações reproduz o saldo — a invariante do modelo", () => {
    // Se isto deixar de valer, histórico e saldo passam a discordar e não há
    // como saber qual dos dois está certo.
    const movimentos: [Parameters<typeof saldoApos>[1], number][] = [
      ["ENTRADA", 10],
      ["SAIDA", 3],
      ["ENTRADA", 5],
      ["AJUSTE", 8],
      ["SAIDA", 2],
    ]
    let saldo = 0
    let somaDasVariacoes = 0
    for (const [tipo, qtd] of movimentos) {
      somaDasVariacoes += variacaoDo(saldo, tipo, qtd)
      saldo = saldoApos(saldo, tipo, qtd)
    }
    expect(Math.round(somaDasVariacoes * 1000) / 1000).toBe(saldo)
    expect(saldo).toBe(6)
  })
})

describe("quantidade válida", () => {
  it("entrada e saída exigem quantidade positiva", () => {
    // Movimento de zero não move nada e só sujaria o histórico.
    expect(quantidadeValida("ENTRADA", 0)).toBe(false)
    expect(quantidadeValida("SAIDA", 0)).toBe(false)
    expect(quantidadeValida("ENTRADA", -1)).toBe(false)
    expect(quantidadeValida("ENTRADA", 0.5)).toBe(true)
  })

  it("ajuste aceita zero — 'acabou' é uma contagem legítima", () => {
    expect(quantidadeValida("AJUSTE", 0)).toBe(true)
    expect(quantidadeValida("AJUSTE", -1)).toBe(false)
  })

  it("recusa o que não é número", () => {
    expect(quantidadeValida("ENTRADA", NaN)).toBe(false)
    expect(quantidadeValida("ENTRADA", Infinity)).toBe(false)
  })
})

describe("alertas", () => {
  it("mínimo zero não alerta nunca", () => {
    // Quem não definiu mínimo não quer ser avisado.
    expect(abaixoDoMinimo(0, 0)).toBe(false)
    expect(abaixoDoMinimo(-5, 0)).toBe(false)
  })

  it("alerta ao chegar no mínimo, não só ao passar", () => {
    // Avisar só abaixo do mínimo é avisar tarde: a última peça já saiu.
    expect(abaixoDoMinimo(3, 3)).toBe(true)
    expect(abaixoDoMinimo(4, 3)).toBe(false)
  })

  it("negativo é sinalizado à parte", () => {
    expect(estaNegativo(-0.5)).toBe(true)
    expect(estaNegativo(0)).toBe(false)
  })

  it("saldo NEGATIVO sem mínimo definido pede reposição", () => {
    // O defeito que uniu as duas regras. A conta de reposição morava em
    // compras-dinheiro.ts e desistia quando o mínimo era zero (`if (minimo <= 0)
    // return 0`), então a peça pintava de VERMELHO na tela de estoque e valia
    // ZERO em "Comprar o que falta". O sistema gritava e nunca oferecia o
    // conserto — e saldo negativo é justamente a peça que o técnico já usou e
    // não tinha.
    expect(estaNegativo(-3)).toBe(true)
    expect(quantoRepor(-3, 0)).toBe(3)
    expect(precisaRepor(-3, 0)).toBe(true)
  })

  it("negativo COM mínimo soma as duas coisas", () => {
    // Faltando 3 com mínimo 5, o que falta comprar são 8, e não 5.
    expect(quantoRepor(-3, 5)).toBe(8)
  })

  it("quem está no mínimo ou acima não gera compra", () => {
    expect(quantoRepor(5, 5)).toBe(0)
    expect(quantoRepor(9, 5)).toBe(0)
    expect(quantoRepor(0, 0)).toBe(0)
  })

  it("arredonda em três casas, como a coluna do banco", () => {
    // Sem isso o saldo carrega lixo binário e ele aparece na tela.
    expect(quantoRepor(0.1 + 0.2, 1)).toBe(0.7)
  })

  it("VERMELHO sempre tem conserto: negativo nunca fica sem reposição", () => {
    // A propriedade que impede a volta do defeito. Era exatamente aqui que as
    // duas regras discordavam, e é o único caso em que o sistema apontava um
    // problema sem oferecer saída.
    for (const saldo of [-0.5, -1, -3, -100]) {
      for (const minimo of [0, 1, 5, 50]) {
        expect(precisaRepor(saldo, minimo), `saldo ${saldo}, mínimo ${minimo}`).toBe(true)
      }
    }
  })

  it("situação combina os dois, com o negativo na frente", () => {
    expect(situacaoDa(-1, 5)).toBe("negativo")
    expect(situacaoDa(2, 5)).toBe("abaixo")
    expect(situacaoDa(9, 5)).toBe("ok")
    expect(situacaoDa(0, 0)).toBe("ok")
  })
})

describe("unidade", () => {
  it("aceita as da lista e recusa texto livre", () => {
    // Texto livre viraria "un", "UN", "unid" e "unidade" na mesma lista, sem
    // somar.
    expect(unidadeValida("un")).toBe(true)
    expect(unidadeValida("kg")).toBe(true)
    expect(unidadeValida("unidade")).toBe(false)
    expect(unidadeValida("")).toBe(false)
  })
})
