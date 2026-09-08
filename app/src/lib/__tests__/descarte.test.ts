import { describe, expect, it } from "vitest"
import {
  DIAS_PARA_ABANDONO,
  oQueVaiJunto,
  podeApagar,
  porQueNaoApagar,
  type RetratoDaEmpresa,
} from "@/lib/descarte"

// Apagar empresa é a operação mais destrutiva deste sistema: leva junto
// usuários, clientes, ordens de serviço, receitas e notas emitidas. Não há
// desfazer, não há lixeira, e o dado é de TERCEIROS — os clientes finais da
// empresa apagada.
//
// Uma condição errada aqui não dá erro. Apaga.

const agora = new Date("2026-08-24T12:00:00Z")
const haDias = (n: number) => new Date(agora.getTime() - n * 86_400_000)

function empresa(over: Partial<RetratoDaEmpresa> = {}): RetratoDaEmpresa {
  return {
    id: "t1",
    nome: "Cadastro Abandonado",
    situacao: "TRIAL",
    jaAssinou: false,
    criadaEm: haDias(30),
    usuarios: 1,
    clientes: 0,
    ordens: 0,
    receitas: 0,
    orcamentos: 0,
    ...over,
  }
}

describe("o caso que motivou a funcionalidade", () => {
  it("cadastro velho, sem assinatura e sem nada dentro PODE ser apagado", () => {
    expect(porQueNaoApagar(empresa(), agora)).toBeNull()
    expect(podeApagar(empresa(), agora)).toBe(true)
  })
})

describe("quem NUNCA pode ser apagado", () => {
  it("empresa pagando", () => {
    expect(porQueNaoApagar(empresa({ situacao: "ACTIVE" }), agora)).toBe("assinaturaViva")
  })

  it("empresa inadimplente — atraso não é abandono", () => {
    // PAST_DUE é cliente com problema de cobrança, e o sistema já tem 30 dias
    // de carência para isso. Apagar seria resolver inadimplência destruindo o
    // cliente.
    expect(porQueNaoApagar(empresa({ situacao: "PAST_DUE" }), agora)).toBe("assinaturaViva")
  })

  it("empresa que acabou de assinar e espera confirmação", () => {
    // PENDING é quem JÁ PAGOU e está esperando o repasse confirmar. É o pior
    // momento possível para sumir com a conta.
    expect(porQueNaoApagar(empresa({ situacao: "PENDING" }), agora)).toBe("assinaturaViva")
  })

  it("quem já foi cliente, mesmo tendo cancelado", () => {
    // Cancelar assinatura não é o mesmo que nunca ter sido cliente: o registro
    // tem valor contábil e fiscal.
    const r = porQueNaoApagar(empresa({ situacao: "CANCELLED", jaAssinou: true }), agora)
    expect(r).toBe("jaFoiCliente")
  })
})

describe("qualquer trabalho registrado dentro protege a empresa", () => {
  it.each([
    ["clientes", { clientes: 1 }],
    ["ordens de serviço", { ordens: 1 }],
    ["receitas", { receitas: 1 }],
    ["orçamentos", { orcamentos: 1 }],
  ])("um único registro de %s já impede", (_rotulo, campo) => {
    expect(porQueNaoApagar(empresa(campo), agora)).toBe("temDados")
  })

  it("usuário sozinho NÃO impede — todo cadastro tem o dono", () => {
    // Se usuário contasse como "tem dados", nenhum cadastro abandonado seria
    // apagável, e a funcionalidade não serviria para nada.
    expect(porQueNaoApagar(empresa({ usuarios: 1 }), agora)).toBeNull()
  })
})

describe("cadastro recente é protegido", () => {
  it("criado hoje não some", () => {
    // Pode ser alguém no meio do processo AGORA.
    expect(porQueNaoApagar(empresa({ criadaEm: agora }), agora)).toBe("recenteDemais")
  })

  it("criado ontem também não", () => {
    expect(porQueNaoApagar(empresa({ criadaEm: haDias(1) }), agora)).toBe("recenteDemais")
  })

  it("na véspera do prazo, ainda não", () => {
    expect(porQueNaoApagar(empresa({ criadaEm: haDias(DIAS_PARA_ABANDONO - 1) }), agora)).toBe(
      "recenteDemais"
    )
  })

  it("completado o prazo, pode", () => {
    // Quem cria a conta na sexta e volta na segunda para assinar não pode
    // encontrar a empresa apagada.
    expect(porQueNaoApagar(empresa({ criadaEm: haDias(DIAS_PARA_ABANDONO) }), agora)).toBeNull()
  })

  it("o prazo é de pelo menos alguns dias", () => {
    // Um prazo de um dia transformaria a limpeza em perda de cliente.
    expect(DIAS_PARA_ABANDONO).toBeGreaterThanOrEqual(7)
  })
})

describe("a ordem dos motivos", () => {
  it("assinatura viva vence tudo", () => {
    // A razão mais grave primeiro: é a que não muda com o tempo nem com
    // limpeza de dados, e é a que quem administra precisa ler.
    const r = porQueNaoApagar(
      empresa({ situacao: "ACTIVE", jaAssinou: true, clientes: 9, criadaEm: agora }),
      agora
    )
    expect(r).toBe("assinaturaViva")
  })

  it("ter sido cliente vence ter dados", () => {
    const r = porQueNaoApagar(
      empresa({ situacao: "CANCELLED", jaAssinou: true, clientes: 9 }),
      agora
    )
    expect(r).toBe("jaFoiCliente")
  })

  it("ter dados vence ser recente", () => {
    const r = porQueNaoApagar(empresa({ clientes: 1, criadaEm: agora }), agora)
    expect(r).toBe("temDados")
  })
})

describe("o que a confirmação mostra", () => {
  it("diz quantos usuários vão junto", () => {
    expect(oQueVaiJunto(empresa({ usuarios: 2 }))).toEqual(["2 usuários"])
    expect(oQueVaiJunto(empresa({ usuarios: 1 }))).toEqual(["1 usuário"])
  })

  it("empresa sem ninguém não inventa item", () => {
    expect(oQueVaiJunto(empresa({ usuarios: 0 }))).toEqual([])
  })
})
