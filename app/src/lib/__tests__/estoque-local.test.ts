import { describe, expect, it } from "vitest"
import {
  LOCAL_PADRAO,
  localPadrao,
  nomeCompleto,
  podeDesativarLocal,
  problemaNaTransferencia,
  tipoDeLocalValido,
  totalDosLocais,
  type Local,
} from "@/lib/estoque-local"

// A regra do estoque por local, sem banco.
//
// O que este recurso existe para responder é "ONDE está a peça" — porque num
// negócio de campo a van de cada técnico é um almoxarifado que anda, e "tem 4
// no estoque" pode significar "tem 4 do outro lado da cidade".

const almox = (over: Partial<Local> = {}): Local => ({
  id: "l1",
  nome: "Almoxarifado",
  tipo: "ALMOXARIFADO",
  userId: null,
  ativo: true,
  ...over,
})

const van = (over: Partial<Local> = {}): Local => ({
  id: "l2",
  nome: "Van 01",
  tipo: "VEICULO",
  userId: "u1",
  ativo: true,
  ...over,
})

describe("o local padrão", () => {
  it("é a VAN de quem está movimentando, quando ele tem uma", () => {
    // O técnico que gasta uma peça gasta a que está com ele. Obrigá-lo a
    // escolher todo dia o mesmo local é a forma mais rápida de ele escolher
    // errado com pressa.
    const escolhido = localPadrao([almox(), van()], "u1")
    expect(escolhido?.id).toBe("l2")
  })

  it("é a van DELE, e não a de outro técnico", () => {
    // O erro que isto evita é o pior possível aqui: baixar a peça do carro do
    // colega, que descobre no dia seguinte que perdeu estoque sem ter usado.
    const doOutro = van({ id: "l3", userId: "u9", nome: "Van 02" })
    expect(localPadrao([almox(), doOutro], "u1")?.id).toBe("l1")
  })

  it("é o almoxarifado quando a pessoa não tem van", () => {
    expect(localPadrao([van({ userId: "u9" }), almox()], "u1")?.id).toBe("l1")
  })

  it("ignora local desativado", () => {
    expect(localPadrao([almox({ ativo: false }), van()], null)?.id).toBe("l2")
  })

  it("sem local nenhum, devolve null em vez de inventar", () => {
    // Quem chama precisa TRATAR isso. Gravar num local inventado esconderia o
    // problema até alguém procurar a peça e não achar.
    expect(localPadrao([], "u1")).toBeNull()
    expect(localPadrao([almox({ ativo: false })], "u1")).toBeNull()
  })

  it("sem usuário, cai no almoxarifado", () => {
    // É o caso do recebimento de uma ordem de compra: a peça chega no depósito,
    // não no carro de ninguém.
    expect(localPadrao([van(), almox()], null)?.id).toBe("l1")
  })
})

describe("a transferência", () => {
  const ok = { origem: almox(), destino: van(), quantidade: 2, saldoNaOrigem: 10 }

  it("aceita o caso normal", () => {
    expect(problemaNaTransferencia(ok)).toBeNull()
  })

  it("recusa mover MAIS do que existe na origem", () => {
    // Saldo negativo é tolerado no movimento avulso — a realidade chega ao
    // sistema atrasada, e travar a baixa da OS pararia o trabalho. Mas numa
    // transferência não: mover o que não está lá não é registro atrasado, é
    // engano, e criaria saldo do nada no destino.
    expect(problemaNaTransferencia({ ...ok, quantidade: 11 })).toBe("saldoInsuficiente")
  })

  it("aceita mover exatamente tudo", () => {
    expect(problemaNaTransferencia({ ...ok, quantidade: 10 })).toBeNull()
  })

  it("recusa origem igual ao destino", () => {
    expect(problemaNaTransferencia({ ...ok, destino: almox() })).toBe("mesmoLocal")
  })

  it("recusa quantidade zero, negativa ou não numérica", () => {
    for (const q of [0, -3, NaN, Infinity]) {
      expect(problemaNaTransferencia({ ...ok, quantidade: q }), String(q)).toBe(
        "quantidadeInvalida"
      )
    }
  })

  it("recusa local desativado dos dois lados", () => {
    expect(problemaNaTransferencia({ ...ok, origem: almox({ ativo: false }) })).toBe("localInativo")
    expect(problemaNaTransferencia({ ...ok, destino: van({ ativo: false }) })).toBe("localInativo")
  })

  it("recusa local inexistente", () => {
    expect(problemaNaTransferencia({ ...ok, origem: null })).toBe("localInativo")
    expect(problemaNaTransferencia({ ...ok, destino: null })).toBe("localInativo")
  })
})

describe("desativar um local", () => {
  it("só com ele vazio", () => {
    // Com peça dentro, o saldo sumiria da vista sem ter saído de lugar nenhum,
    // e o total da empresa passaria a contar algo que ninguém acha na tela.
    expect(podeDesativarLocal([{ quantidade: 0 }, { quantidade: 0 }])).toBe(true)
    expect(podeDesativarLocal([{ quantidade: 0 }, { quantidade: 2 }])).toBe(false)
  })

  it("local sem peça nenhuma pode ser desativado", () => {
    expect(podeDesativarLocal([])).toBe(true)
  })

  it("saldo NEGATIVO também impede", () => {
    // Negativo é um problema em aberto, não um local vazio. Desativar
    // esconderia a dívida de estoque em vez de resolvê-la.
    expect(podeDesativarLocal([{ quantidade: -1 }])).toBe(false)
  })
})

describe("o total é a soma das partes", () => {
  it("soma os saldos", () => {
    expect(totalDosLocais([{ quantidade: 4 }, { quantidade: 2.5 }])).toBe(6.5)
  })

  it("sem locais, é zero", () => {
    expect(totalDosLocais([])).toBe(0)
  })

  it("soma frações de três casas sem sobra binária", () => {
    // A coluna é Decimal(12,3). Somar float puro daria 0.30000000000000004 e o
    // total passaria a diferir da soma por um fio — que é justamente o que o
    // teste de consistência procuraria e acusaria como defeito.
    expect(totalDosLocais([{ quantidade: 0.1 }, { quantidade: 0.2 }])).toBe(0.3)
  })

  it("aceita negativo sem mascarar", () => {
    expect(totalDosLocais([{ quantidade: 5 }, { quantidade: -2 }])).toBe(3)
  })
})

describe("detalhes", () => {
  it("o tipo é validado", () => {
    expect(tipoDeLocalValido("VEICULO")).toBe(true)
    expect(tipoDeLocalValido("ALMOXARIFADO")).toBe(true)
    expect(tipoDeLocalValido("GAVETA")).toBe(false)
  })

  it("a van mostra de quem é", () => {
    // "Van 01" não diz nada numa lista de seis. "Van 01 — Carlos" diz.
    expect(nomeCompleto(van(), "Carlos")).toBe("Van 01 — Carlos")
    expect(nomeCompleto(van(), null)).toBe("Van 01")
    expect(nomeCompleto(almox(), "Carlos")).toBe("Almoxarifado")
  })

  it("o local padrão da migração tem nome", () => {
    // A migração precisa pôr o saldo existente em algum lugar, e esse lugar
    // tem de ter nome antes de o dono abrir a tela — senão ele encontra "sem
    // local" e não sabe se é defeito.
    expect(LOCAL_PADRAO.length).toBeGreaterThan(0)
  })
})
