import { describe, expect, it } from "vitest"
import {
  LOCAL_PADRAO,
  localPadrao,
  motivoDaTransferencia,
  nomeCompleto,
  ordemDoTipo,
  podeDesativarLocal,
  problemaNaTransferencia,
  saldosParaTransferir,
  TIPOS_DE_LOCAL,
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

describe("os setores", () => {
  it("os quatro que a empresa pediu existem, e o almoxarifado vem primeiro", () => {
    // Recebimento, produção e expedição entraram em 04/09/2026. A ordem é a
    // do <select>: ALMOXARIFADO primeiro porque é o padrão e o caso comum.
    expect(TIPOS_DE_LOCAL).toEqual([
      "ALMOXARIFADO",
      "RECEBIMENTO",
      "PRODUCAO",
      "EXPEDICAO",
      "VEICULO",
    ])
  })

  it("cada setor passa na validação do formulário", () => {
    // A trava de tipo é o que separa o <select> da Action — um tipo novo na
    // tela e ausente aqui daria "tipo inválido" ao salvar.
    for (const tipo of TIPOS_DE_LOCAL) expect(tipoDeLocalValido(tipo)).toBe(true)
  })

  it("o padrão continua sendo o almoxarifado, e não o primeiro setor da lista", () => {
    // Com cinco tipos, "qualquer local ativo" passou a poder cair no
    // recebimento — que é onde a peça CHEGA, não onde ela mora. A baixa da OS
    // e o recebimento de compra usam este padrão.
    const escolhido = localPadrao(
      [
        { id: "r", nome: "Recebimento", tipo: "RECEBIMENTO", userId: null, ativo: true },
        almox({ id: "a" }),
      ],
      null
    )
    expect(escolhido?.id).toBe("a")
  })
})

describe("o motivo da transferência", () => {
  it("guarda o PORQUÊ junto do para-onde", () => {
    // Antes a linha dizia só "Transferência para Expedição". Isso responde
    // para onde e nunca responde por quê — que é metade do que se pergunta
    // três meses depois.
    const texto = motivoDaTransferencia("separado para a entrega de amanhã", "Expedição", "saida")
    expect(texto).toContain("Expedição")
    expect(texto).toContain("separado para a entrega de amanhã")
  })

  it("sem motivo, a linha continua exatamente como sempre foi", () => {
    // Motivo é opcional de propósito: campo obrigatório de justificativa
    // ensina a digitar "x" para o formulário passar. E as linhas antigas do
    // histórico precisam continuar querendo dizer a mesma coisa.
    expect(motivoDaTransferencia("", "Expedição", "saida")).toBe("Transferência para Expedição")
    expect(motivoDaTransferencia("   ", "Almoxarifado", "entrada")).toBe(
      "Transferência de Almoxarifado"
    )
  })

  it("a perna de entrada diz DE ONDE veio, não para onde vai", () => {
    // As duas pernas são linhas separadas, cada uma no histórico do seu
    // local. Trocar o sentido faria o destino registrar que mandou a peça
    // para si mesmo.
    expect(motivoDaTransferencia("", "Van 01", "entrada")).toBe("Transferência de Van 01")
  })

  it("corta motivo gigante em vez de recusar a transferência", () => {
    // A peça já se moveu de verdade no galpão. Barrar o registro por causa do
    // tamanho do texto deixaria o sistema mentindo sobre onde ela está.
    const texto = motivoDaTransferencia("x".repeat(500), "Expedição", "saida")
    expect(texto.length).toBeLessThan(500)
    expect(texto).toContain("Expedição")
  })
})

describe("para onde a peça pode ir", () => {
  it("o setor VAZIO aparece como destino", () => {
    // O defeito que isto conserta: enquanto a tela listava só os locais com
    // saldo, um setor recém-criado nunca aparecia como destino — e a única
    // forma de ganhar saldo era receber uma transferência. O recurso de
    // setores inteiro morria nesse laço.
    const expedicao: Local = {
      id: "exp",
      nome: "Expedição",
      tipo: "EXPEDICAO",
      userId: null,
      ativo: true,
    }
    const linhas = saldosParaTransferir([almox(), expedicao], [{ locationId: "l1", quantidade: 4 }])

    expect(linhas.map((l) => l.local.id)).toContain("exp")
    expect(linhas.find((l) => l.local.id === "exp")?.quantidade).toBe(0)
    expect(linhas.find((l) => l.local.id === "l1")?.quantidade).toBe(4)
  })

  it("local inativo SOME — a não ser que ainda tenha peça presa dentro", () => {
    // Escondê-lo com saldo prenderia a peça lá: desativar exige esvaziar, e
    // esvaziar é transferir a partir dele.
    const mortoVazio = almox({ id: "m1", nome: "Depósito velho", ativo: false })
    const mortoCheio = almox({ id: "m2", nome: "Depósito antigo", ativo: false })

    const linhas = saldosParaTransferir(
      [almox(), mortoVazio, mortoCheio],
      [{ locationId: "m2", quantidade: 3 }]
    )

    expect(linhas.map((l) => l.local.id)).not.toContain("m1")
    expect(linhas.map((l) => l.local.id)).toContain("m2")
  })

  it("saldo negativo num local inativo também continua visível", () => {
    // Negativo é registro atrasado, não ausência. Sumir com ele esconderia
    // justamente o local que precisa ser acertado.
    const morto = almox({ id: "m", ativo: false })
    const linhas = saldosParaTransferir([morto], [{ locationId: "m", quantidade: -2 }])
    expect(linhas).toHaveLength(1)
  })
})

describe("a ordem dos setores na tela", () => {
  it("não é a ordem do enum do banco", () => {
    // O Postgres ordena enum pela ordem de DECLARAÇÃO, e RECEBIMENTO/PRODUCAO/
    // EXPEDICAO tiveram de ser declarados DEPOIS de VEICULO — não existe
    // inserir valor no meio de um enum. Ordenar no banco jogaria a van entre o
    // almoxarifado e o recebimento.
    expect(ordemDoTipo("ALMOXARIFADO")).toBeLessThan(ordemDoTipo("RECEBIMENTO"))
    expect(ordemDoTipo("RECEBIMENTO")).toBeLessThan(ordemDoTipo("EXPEDICAO"))
    expect(ordemDoTipo("EXPEDICAO")).toBeLessThan(ordemDoTipo("VEICULO"))
  })

  it("tipo desconhecido vai para o FIM, não para o começo", () => {
    // Se um valor novo chegar do banco antes de existir aqui, ele aparece no
    // lugar menos danoso — e não empurrando o almoxarifado para baixo.
    expect(ordemDoTipo("SETOR_QUE_NAO_EXISTE")).toBeGreaterThan(ordemDoTipo("VEICULO"))
  })
})
