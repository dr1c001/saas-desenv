import { describe, expect, it } from "vitest"
import { ALL_TABS } from "@/lib/abas"
import {
  abasInvalidas,
  destinosPermitidos,
  destinosPorCodigo,
  DESTINOS,
  normalizarCodigo,
  pareceCodigo,
} from "@/lib/codigos-abas"

describe("o catálogo de códigos", () => {
  it("não repete número", () => {
    // Código repetido é atalho que leva a lugar diferente conforme a ordem da
    // lista — e quem decorou o número não descobre por quê.
    const codigos = DESTINOS.map((d) => d.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it("não repete rota", () => {
    const rotas = DESTINOS.map((d) => d.rota)
    expect(new Set(rotas).size).toBe(rotas.length)
  })

  it("todo destino aponta para uma aba que existe", () => {
    // Slug digitado errado aqui vira um atalho que nunca aparece para ninguém,
    // porque a filtragem por permissão nunca casa.
    expect(abasInvalidas()).toEqual([])
  })

  it("toda aba do menu tem um código", () => {
    // Se uma aba nova entrar em ALL_TABS e ninguém der número a ela, ela fica
    // invisível para quem usa os atalhos — e o teste avisa em vez de deixar.
    const comCodigo = new Set(DESTINOS.map((d) => d.aba).filter(Boolean))
    const semCodigo = ALL_TABS.map((t) => t.slug).filter((s) => !comCodigo.has(s))
    expect(semCodigo).toEqual([])
  })

  it("todo código tem formato de número separado por ponto", () => {
    for (const d of DESTINOS) {
      expect(d.codigo, d.rota).toMatch(/^\d+(\.\d+)*$/)
    }
  })
})

describe("o que a pessoa digita", () => {
  it("aceita vírgula e espaço além do ponto", () => {
    // Quem digita rápido no teclado numérico erra o separador. Recusar por
    // causa disso transformaria o atalho em obstáculo.
    expect(normalizarCodigo("1,1")).toBe("1.1")
    expect(normalizarCodigo("1 1")).toBe("1.1")
    expect(normalizarCodigo(" 5.4.2 ")).toBe("5.4.2")
    expect(normalizarCodigo("1..1")).toBe("1.1")
  })

  it("distingue código de nome de tela", () => {
    expect(pareceCodigo("1.1")).toBe(true)
    expect(pareceCodigo("5,4,2")).toBe(true)
    expect(pareceCodigo("orçamento")).toBe(false)
    expect(pareceCodigo("")).toBe(false)
  })
})

describe("para onde o número leva", () => {
  it("o exemplo do dono: 1.1 é Ordens de Serviço", () => {
    expect(destinosPorCodigo("1.1")[0].rota).toBe("/service-orders")
  })

  it("prefixo mostra as opções em vez de adivinhar", () => {
    // "5.4" é destino E começo de seis outros. Levar direto para um deles seria
    // escolher pela pessoa.
    const r = destinosPorCodigo("5.4")
    expect(r[0].rota).toBe("/settings")
    expect(r.length).toBeGreaterThan(1)
    expect(r.map((d) => d.rota)).toContain("/settings/permissions")
  })

  it("o exato vem primeiro", () => {
    expect(destinosPorCodigo("5.4")[0].codigo).toBe("5.4")
  })

  it("número que não existe não leva a lugar nenhum", () => {
    expect(destinosPorCodigo("9.9")).toEqual([])
    expect(destinosPorCodigo("")).toEqual([])
  })

  it("terceiro nível funciona", () => {
    expect(destinosPorCodigo("5.4.2")[0].rota).toBe("/settings/fields")
  })
})

describe("só aparece o que a pessoa pode abrir", () => {
  it("técnico não vê atalho de tela de administrador", () => {
    // Atalho que leva a uma tela que redireciona de volta é pior que atalho
    // nenhum: parece defeito.
    const r = destinosPermitidos(DESTINOS, ["service-orders", "schedule"], false)
    expect(r.map((d) => d.rota)).not.toContain("/settings")
    expect(r.map((d) => d.rota)).not.toContain("/settings/permissions")
  })

  it("técnico vê só as abas dele", () => {
    const r = destinosPermitidos(DESTINOS, ["service-orders", "schedule"], false)
    expect(r.map((d) => d.rota).sort()).toEqual(["/schedule", "/service-orders"])
  })

  it("administrador vê tudo que as abas dele permitem, mais as de configuração", () => {
    const todas = ALL_TABS.map((t) => t.slug)
    const r = destinosPermitidos(DESTINOS, todas, true)
    expect(r.length).toBe(DESTINOS.length)
  })

  it("aba bloqueada pelo plano some do atalho junto", () => {
    // Mapa e Fiscal dependem de recurso. Sem o recurso a aba não vem em
    // abasPermitidas, e o atalho tem de sumir pelo mesmo caminho.
    const semMapa = ALL_TABS.map((t) => t.slug).filter((s) => s !== "map")
    const r = destinosPermitidos(DESTINOS, semMapa, true)
    expect(r.map((d) => d.rota)).not.toContain("/map")
  })
})
