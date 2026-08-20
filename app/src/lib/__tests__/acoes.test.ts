import { describe, expect, it } from "vitest"
import {
  ACOES,
  ACOES_PADRAO_TECNICO,
  acoesValendo,
  ehAcao,
  podeFazer,
  type Acao,
} from "@/lib/acoes"

describe("o catálogo", () => {
  it("não tem repetido", () => {
    expect(new Set(ACOES).size).toBe(ACOES.length)
  })

  it("reconhece o que é ação e o que não é", () => {
    expect(ehAcao("os.editar")).toBe(true)
    expect(ehAcao("os.excluir")).toBe(false)
  })

  it("NÃO oferece o que sempre foi só de OWNER/ADMIN", () => {
    // Trazer excluir, financeiro ou faturar para cá sugeriria que dá para
    // liberar para o técnico, e a tela passaria a mostrar um botão que não
    // deveria existir. Este teste é o que impede a lista de crescer no
    // automático.
    for (const proibida of ["os.excluir", "financeiro.ver", "os.faturar", "equipe.convidar"]) {
      expect(ehAcao(proibida)).toBe(false)
    }
  })
})

describe("quem pode o quê", () => {
  it("OWNER e ADMIN passam mesmo com a lista vazia", () => {
    // Um dono que se trancasse para fora não teria como voltar: a tela que
    // conserta é a dele.
    expect(podeFazer("OWNER", [], "os.editar")).toBe(true)
    expect(podeFazer("ADMIN", [], "os.editar")).toBe(true)
  })

  it("técnico só passa no que está liberado", () => {
    const permitidas: Acao[] = ["os.concluir"]
    expect(podeFazer("TECHNICIAN", permitidas, "os.concluir")).toBe(true)
    expect(podeFazer("TECHNICIAN", permitidas, "os.editar")).toBe(false)
  })

  it("papel desconhecido não vira dono por acidente", () => {
    expect(podeFazer("QUALQUER", [], "os.editar")).toBe(false)
  })
})

describe("o padrão e o desmarcar tudo", () => {
  it("empresa que nunca mexeu continua com tudo liberado", () => {
    // O comportamento de hoje. Fechar por padrão deixaria todo cliente atual
    // com os técnicos parados na segunda-feira sem ter pedido nada.
    expect(acoesValendo(false, [])).toEqual(ACOES_PADRAO_TECNICO)
  })

  it("desmarcar TUDO na tela deixa nada liberado, e não o padrão", () => {
    // É o defeito que a permissão por ABA tem: lista vazia significa duas
    // coisas opostas, e o sistema escolhe a errada. Aqui `configurado` separa.
    expect(acoesValendo(true, [])).toEqual([])
  })

  it("o que foi gravado é o que vale", () => {
    expect(acoesValendo(true, ["os.concluir"])).toEqual(["os.concluir"])
  })
})
