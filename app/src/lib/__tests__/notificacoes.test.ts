import { describe, expect, it } from "vitest"
import {
  definicaoDe,
  ehEvento,
  etiqueta,
  EVENTOS,
  querReceber,
  silenciadosValidos,
} from "@/lib/notificacoes"

describe("o catálogo", () => {
  it("não repete evento", () => {
    const chaves = EVENTOS.map((e) => e.evento)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it("todo evento tem um público definido", () => {
    for (const e of EVENTOS) {
      expect(["responsavel", "escritorio"], e.evento).toContain(e.publico)
    }
  })

  it("o que vai para quem está em CAMPO é insistente", () => {
    // O técnico está com o celular no bolso, na rua. Uma notificação que some
    // sozinha é uma notificação que ele não viu — e perder isto é perder o
    // serviço do dia.
    expect(definicaoDe("osAtribuida").insistente).toBe(true)
    expect(definicaoDe("osDeContrato").insistente).toBe(true)
  })

  it("mudança de status NÃO é insistente", () => {
    // É informação de acompanhamento. Exigir toque a cada mudança faria o
    // escritório desligar tudo na primeira semana.
    expect(definicaoDe("osStatus").insistente).toBeFalsy()
  })

  it("reconhece o que é evento e o que não é", () => {
    expect(ehEvento("osConcluida")).toBe(true)
    expect(ehEvento("qualquerCoisa")).toBe(false)
  })
})

describe("quem quer receber o quê", () => {
  it("sem nada silenciado, recebe TUDO", () => {
    // Ninguém deixa de ser avisado no dia em que a tela de preferências passa
    // a existir.
    for (const e of EVENTOS) {
      expect(querReceber(e.evento, []), e.evento).toBe(true)
    }
  })

  it("silencia só o que está na lista", () => {
    expect(querReceber("osStatus", ["osStatus"])).toBe(false)
    expect(querReceber("osConcluida", ["osStatus"])).toBe(true)
  })

  it("chave desconhecida não silencia nada", () => {
    expect(querReceber("osConcluida", ["inventado"])).toBe(true)
  })

  it("guarda só o que o código conhece", () => {
    expect(silenciadosValidos(["osStatus", "lixo", "osStatus"])).toEqual(["osStatus"])
  })
})

describe("agrupamento no celular", () => {
  it("mudanças da MESMA OS substituem uma à outra", () => {
    // Sem isto, dez mudanças de status viram dez notificações empilhadas. O
    // que importa é o estado atual, não o histórico do que já passou.
    expect(etiqueta("osStatus", "os-1")).toBe("os:os-1")
    expect(etiqueta("osConcluida", "os-1")).toBe("os:os-1")
  })

  it("OS diferentes não se substituem", () => {
    expect(etiqueta("osStatus", "os-1")).not.toBe(etiqueta("osStatus", "os-2"))
  })

  it("OS atribuída NÃO agrupa — cada uma é um serviço a fazer", () => {
    // Substituir uma atribuição pela outra esconderia trabalho do técnico.
    expect(etiqueta("osAtribuida", "os-1")).toBeUndefined()
    expect(etiqueta("osDeContrato", "os-1")).toBeUndefined()
  })
})
