import { describe, expect, it } from "vitest"
import {
  ehSubcliente,
  pagadorValido,
  pagadoresPossiveis,
  podeSerContratante,
  quemPaga,
  somarPorPagador,
} from "@/lib/subcliente"

// O que estes testes protegem: a nota fiscal sai no CNPJ de quem PAGA.
//
// Todo o resto aqui é conveniência de cadastro. Errar quem paga é emitir
// documento fiscal contra terceiro, no nome da empresa do cliente, perante a
// prefeitura — e não há botão de desfazer para isso.

const admin = { id: "adm", parentId: null }
const condominio = { id: "cond", parentId: "adm" }
const avulso = { id: "avulso", parentId: null }

describe("quem paga por esta ordem de serviço", () => {
  it("sem contratante, paga o próprio cliente", () => {
    // É o comportamento de hoje, e ele não pode mudar: nenhuma das OS que já
    // existem tem contratante.
    expect(quemPaga(avulso)).toBe("avulso")
  })

  it("com contratante, o padrão é o contratante pagar", () => {
    expect(quemPaga(condominio)).toBe("adm")
  })

  it("mas dá para cobrar do cliente final naquela OS", () => {
    // O caso que motivou o campo: a administradora paga quase tudo, e às vezes
    // o condomínio paga direto um serviço extra.
    expect(quemPaga(condominio, "cond")).toBe("cond")
  })

  it("escolher o contratante explicitamente dá no mesmo", () => {
    expect(quemPaga(condominio, "adm")).toBe("adm")
  })

  it("pagador de fora da relação NÃO vale, e cai no padrão", () => {
    // Server Action é endereço HTTP: sem esta guarda, bastaria chamar direto
    // para emitir nota no CNPJ de um terceiro sem relação com o serviço.
    expect(quemPaga(condominio, "empresa-aleatoria")).toBe("adm")
    expect(quemPaga(avulso, "outro-qualquer")).toBe("avulso")
  })

  it("vazio, nulo e indefinido caem no padrão", () => {
    expect(quemPaga(condominio, "")).toBe("adm")
    expect(quemPaga(condominio, null)).toBe("adm")
    expect(quemPaga(condominio, undefined)).toBe("adm")
  })
})

describe("quem pode ser escolhido como pagador", () => {
  it("só o cliente e o contratante dele", () => {
    expect(pagadorValido(condominio, "cond")).toBe(true)
    expect(pagadorValido(condominio, "adm")).toBe(true)
    expect(pagadorValido(condominio, "terceiro")).toBe(false)
  })

  it("cliente sem contratante só pode pagar ele mesmo", () => {
    expect(pagadorValido(avulso, "avulso")).toBe(true)
    expect(pagadorValido(avulso, "adm")).toBe(false)
  })

  it("a tela mostra o contratante primeiro, que é o caso comum", () => {
    expect(pagadoresPossiveis(condominio)).toEqual(["adm", "cond"])
  })

  it("sem contratante, não há escolha a fazer", () => {
    // A tela não deve mostrar um seletor de uma opção só.
    expect(pagadoresPossiveis(avulso)).toEqual(["avulso"])
  })
})

describe("um nível só", () => {
  const semSubs = { temSubclientes: false }

  it("aceita o vínculo normal", () => {
    expect(podeSerContratante({ ...condominio, parentId: null, ...semSubs }, admin)).toBeNull()
  })

  it("ninguém é contratante de si mesmo", () => {
    expect(podeSerContratante({ ...admin, ...semSubs }, admin)).toBe("sequeEleMesmo")
  })

  it("não dá para pendurar num contratante que já é subcliente", () => {
    // A regra que mata o ciclo pela raiz: sem ela seria preciso detectar laço
    // em toda gravação, e um laço não detectado trava a busca de quem paga.
    expect(
      podeSerContratante({ id: "novo", parentId: null, ...semSubs }, condominio)
    ).toBe("contratanteJaEhSubcliente")
  })

  it("quem já tem subclientes não vira subcliente", () => {
    expect(
      podeSerContratante({ id: "adm", parentId: null, temSubclientes: true }, {
        id: "outra",
        parentId: null,
      })
    ).toBe("jaEhContratante")
  })

  it("os dois lados juntos impedem qualquer ciclo de dois", () => {
    // A vira subcliente de B só se B não for subcliente de ninguém e A não for
    // contratante de ninguém. Não há como fechar o laço.
    const a = { id: "a", parentId: null, temSubclientes: true }
    const b = { id: "b", parentId: "a" }
    expect(podeSerContratante(a, b)).not.toBeNull()
  })
})

describe("identificar subcliente", () => {
  it("distingue os dois", () => {
    expect(ehSubcliente(condominio)).toBe(true)
    expect(ehSubcliente(avulso)).toBe(false)
  })
})

describe("somar dinheiro por pagador", () => {
  it("junta o que trinta condomínios devem à mesma administradora", () => {
    // O defeito que isto evita: somar por cliente da OS espalha o faturamento
    // da administradora entre os condomínios dela. Nenhum entra no Top 10, e o
    // cliente que MAIS fatura some do relatório.
    const os = [
      { pagador: "adm", valor: 1000 },
      { pagador: "adm", valor: 1500 },
      { pagador: "avulso", valor: 800 },
    ]
    const soma = somarPorPagador(os, (o) => o.pagador, (o) => o.valor)
    expect(soma.get("adm")).toBe(2500)
    expect(soma.get("avulso")).toBe(800)
  })

  it("lista vazia devolve mapa vazio", () => {
    expect(somarPorPagador([], () => "x", () => 1).size).toBe(0)
  })
})
