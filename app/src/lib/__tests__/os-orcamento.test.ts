import { describe, expect, it } from "vitest"
import {
  avisoAoFechar,
  lerTaxaDeVisita,
  podeGerarOrcamento,
  situacaoDaVisita,
  valorDeFechamento,
} from "@/lib/os-orcamento"

// A visita que vira orçamento.
//
// O caso: o cliente liga, a empresa abre a OS, o técnico vai até o endereço — e
// no local o cliente só quer saber quanto custa. Até aqui essa visita virava
// uma OS órfã: fechar com valor cheio cobraria um serviço que não houve;
// cancelar apagaria o deslocamento que aconteceu.

describe("a situação da visita", () => {
  it("sem orçamento, é OS comum", () => {
    expect(situacaoDaVisita(null)).toBe("semOrcamento")
    expect(situacaoDaVisita(undefined)).toBe("semOrcamento")
  })

  it("rascunho e enviado são a mesma coisa para a OS", () => {
    // Separá-los faria a tela tratar "não terminei de escrever" e "mandei e
    // estou esperando" de formas diferentes, sem que a OS mude por isso.
    expect(situacaoDaVisita("DRAFT")).toBe("aguardando")
    expect(situacaoDaVisita("SENT")).toBe("aguardando")
  })

  it("aprovado e recusado têm caminhos próprios", () => {
    expect(situacaoDaVisita("APPROVED")).toBe("aprovado")
    expect(situacaoDaVisita("REJECTED")).toBe("recusado")
  })
})

describe("por quanto a OS fecha", () => {
  const itens = 1800

  it("sem orçamento, fecha pelo que tem", () => {
    expect(
      valorDeFechamento({ situacao: "semOrcamento", totalDosItens: itens, taxaDeVisita: 0 })
    ).toBe(1800)
  })

  it("orçamento APROVADO não muda o valor", () => {
    // O cliente aceitou; o serviço vale o que vale.
    expect(
      valorDeFechamento({ situacao: "aprovado", totalDosItens: itens, taxaDeVisita: 120 })
    ).toBe(1800)
  })

  it("RECUSADO fecha só com a taxa de visita", () => {
    // A regra central: serviço recusado não vira receita de serviço. Os itens
    // do orçamento são exatamente o que o cliente decidiu não fazer.
    expect(
      valorDeFechamento({ situacao: "recusado", totalDosItens: itens, taxaDeVisita: 120 })
    ).toBe(120)
  })

  it("RECUSADO sem taxa configurada fecha em ZERO", () => {
    // O padrão. Empresa que absorve a visita como custo de vender fecha em
    // zero — e o `INVOICED` só cria receita acima de zero, então nada é
    // cobrado por construção.
    expect(
      valorDeFechamento({ situacao: "recusado", totalDosItens: itens, taxaDeVisita: 0 })
    ).toBe(0)
  })

  it("taxa negativa nunca vira desconto", () => {
    // Um valor negativo gravado à mão no banco não pode fazer a OS fechar
    // devendo ao cliente.
    expect(
      valorDeFechamento({ situacao: "recusado", totalDosItens: itens, taxaDeVisita: -50 })
    ).toBe(0)
  })

  it("AGUARDANDO ainda fecha pelo valor cheio", () => {
    // Não é papel desta função barrar: quem decide é a tela, com o aviso. A
    // empresa pode ter combinado por telefone e faturado antes da resposta.
    expect(
      valorDeFechamento({ situacao: "aguardando", totalDosItens: itens, taxaDeVisita: 120 })
    ).toBe(1800)
  })
})

describe("o aviso antes de faturar", () => {
  it("avisa com o orçamento em aberto", () => {
    // Faturar sem resposta é o erro caro: cobra-se um serviço que o cliente
    // ainda não aprovou.
    expect(avisoAoFechar("aguardando")).toBe("aguardando")
  })

  it("não avisa nos casos resolvidos", () => {
    for (const s of ["semOrcamento", "aprovado", "recusado"] as const) {
      expect(avisoAoFechar(s), s).toBeNull()
    }
  })
})

describe("a taxa de visita gravada", () => {
  it("lê número normal", () => {
    expect(lerTaxaDeVisita(120)).toBe(120)
    expect(lerTaxaDeVisita("89.90")).toBe(89.9)
  })

  it("vazio, letra e negativo viram zero", () => {
    // Campo mal preenchido não pode virar NaN e contaminar o total da OS.
    for (const v of ["", "abc", null, undefined, -10, NaN]) {
      expect(lerTaxaDeVisita(v), String(v)).toBe(0)
    }
  })

  it("arredonda para centavos", () => {
    expect(lerTaxaDeVisita(89.999)).toBe(90)
  })
})

describe("quando dá para gerar o orçamento", () => {
  it("nas OS em andamento", () => {
    for (const s of ["OPEN", "IN_PROGRESS", "DONE"]) {
      expect(podeGerarOrcamento(s), s).toBe(true)
    }
  })

  it("não na cancelada", () => {
    // O deslocamento não aconteceu, ou foi desfeito.
    expect(podeGerarOrcamento("CANCELLED")).toBe(false)
  })

  it("não na faturada", () => {
    // O dinheiro já foi cobrado; um orçamento depois inverteria a ordem dos
    // fatos e confundiria quem lesse o histórico meses depois.
    expect(podeGerarOrcamento("INVOICED")).toBe(false)
  })
})
