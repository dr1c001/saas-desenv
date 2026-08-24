import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ALL_TABS } from "@/lib/abas"
import {
  abasInvalidas,
  codigoDaAba,
  codigoDaTelaAtual,
  codigoDaRota,
  compararCodigo,
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

  it("toda rota do catálogo EXISTE de verdade", () => {
    // O teste que faltava. "Toda aba tem um código" passava mesmo com o código
    // 3.4 apontando para /fiscal — uma rota que nunca existiu, porque a tela
    // mora em /settings/fiscal. O atalho levava a um 404, e nada acusava.
    const semTela = DESTINOS.filter(
      (d) => !existsSync(join(process.cwd(), "src/app/(dashboard)", d.rota, "page.tsx"))
    ).map((d) => `${d.codigo} → ${d.rota}`)
    expect(semTela).toEqual([])
  })

  it("todo código tem formato de número separado por ponto", () => {
    for (const d of DESTINOS) {
      expect(d.codigo, d.rota).toMatch(/^\d+(\.\d+)*$/)
    }
  })
})

describe("o número na frente do nome, na barra lateral", () => {
  it("acha o código de toda aba do menu", () => {
    // A barra lateral busca por ABA, não por rota: href escrito diferente da
    // rota do catálogo faria o número sumir da tela sem nada acusar.
    for (const t of ALL_TABS) expect(codigoDaAba(t.slug), t.slug).not.toBeNull()
  })

  it("acha o código das telas de configuração, que não têm aba", () => {
    expect(codigoDaRota("/settings")).toBe("5.4")
    expect(codigoDaRota("/settings/permissions")).toBe("5.4.1")
    expect(codigoDaRota("/nao-existe")).toBeNull()
  })

  it("ordena por número, e não por texto", () => {
    // "1.10" antes de "1.2" é o que a ordem alfabética faria — e o menu é
    // ordenado por este código.
    expect(compararCodigo("1.2", "1.10")).toBeLessThan(0)
    expect(compararCodigo("2.1", "1.9")).toBeGreaterThan(0)
    expect(compararCodigo("5.4", "5.4.1")).toBeLessThan(0)
    expect(compararCodigo("1.1", "1.1")).toBe(0)
  })

  it("põe o menu inteiro em ordem crescente", () => {
    const ordenado = [...DESTINOS].sort((a, b) => compararCodigo(a.codigo, b.codigo))
    expect(ordenado[0].codigo).toBe("1.1")
    expect(ordenado.at(-1)!.codigo).toBe("5.4.5")
  })
})

describe("o código da tela aberta agora", () => {
  it("pega o caminho MAIS LONGO, não o primeiro que serve", () => {
    // /settings é prefixo de /settings/fiscal. Pegar o primeiro daria a ajuda
    // de Configurações para quem está na tela Fiscal.
    expect(codigoDaTelaAtual("/settings/fiscal")).toBe("3.4")
    expect(codigoDaTelaAtual("/settings/permissions")).toBe("5.4.1")
    expect(codigoDaTelaAtual("/settings")).toBe("5.4")
  })

  it("uma tela de detalhe cai na lista dela", () => {
    expect(codigoDaTelaAtual("/service-orders/42")).toBe("1.1")
    expect(codigoDaTelaAtual("/clients/9/edit")).toBe("2.1")
  })

  it("não confunde rota parecida", () => {
    // /parts não pode casar com /partscheck, nem /client com /clients.
    expect(codigoDaTelaAtual("/partsxyz")).toBeNull()
    expect(codigoDaTelaAtual("/ajuda")).toBeNull()
    expect(codigoDaTelaAtual("/")).toBeNull()
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
