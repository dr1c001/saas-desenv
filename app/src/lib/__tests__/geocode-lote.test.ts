import { describe, expect, it } from "vitest"
import { consultasPara, lerCoordenadaGeoapify } from "@/lib/geocode"
import {
  consultasDoLote,
  jobExpirado,
  lerResultadoDoLote,
  HORAS_ATE_DESISTIR,
} from "@/lib/geocode-lote"

describe("montagem da consulta", () => {
  it("vai do mais específico pro mais genérico", () => {
    expect(
      consultasPara({ street: "Rua das Flores", number: "100", city: "Piracicaba", state: "SP" })
    ).toEqual([
      "Rua das Flores, 100, Piracicaba, SP, Brasil",
      "Rua das Flores, Piracicaba, SP, Brasil",
      "Piracicaba, SP, Brasil",
    ])
  })

  it("expande as abreviações que o brasileiro digita", () => {
    // "av abel francisco" devolve vazio; "avenida abel francisco" acha.
    const qs = consultasPara({ street: "av abel francisco", city: "Piracicaba" })
    expect(qs[0]).toContain("avenida abel francisco")
  })

  it("sem rua, sobra só a cidade — pino aproximado é melhor que nenhum", () => {
    expect(consultasPara({ city: "Campinas", state: "SP" })).toEqual(["Campinas, SP, Brasil"])
  })

  it("sem rua e sem cidade, não há o que consultar", () => {
    expect(consultasPara({ state: "SP" })).toEqual([])
    expect(consultasPara({})).toEqual([])
  })
})

describe("leitura da resposta avulsa", () => {
  it("lê lat/lon", () => {
    expect(lerCoordenadaGeoapify({ results: [{ lat: -22.72, lon: -47.64 }] })).toEqual({
      latitude: -22.72,
      longitude: -47.64,
    })
  })

  it("devolve null quando não achou nada", () => {
    expect(lerCoordenadaGeoapify({ results: [] })).toBeNull()
    expect(lerCoordenadaGeoapify({})).toBeNull()
    expect(lerCoordenadaGeoapify(null)).toBeNull()
  })

  it("recusa coordenada que não é número", () => {
    // Number(undefined) é NaN. NaN gravado no banco vira pino no meio do
    // oceano — pior que pino nenhum, porque parece que funcionou.
    expect(lerCoordenadaGeoapify({ results: [{ lat: "abc", lon: -47 }] })).toBeNull()
    expect(lerCoordenadaGeoapify({ results: [{ lon: -47 }] })).toBeNull()
  })
})

describe("lote", () => {
  const enderecos = [
    { street: "Rua A", number: "1", city: "Piracicaba", state: "SP" },
    { street: "Rua B", city: "Campinas", state: "SP" },
    { state: "SP" }, // sem rua e sem cidade
  ]

  it("manda a consulta mais específica de cada endereço", () => {
    expect(consultasDoLote(enderecos)).toEqual([
      "Rua A, 1, Piracicaba, SP, Brasil",
      "Rua B, Campinas, SP, Brasil",
      "",
    ])
  })

  it("mantém a posição de quem não tem consulta", () => {
    // Tirar o vazio aqui desalinharia todo o resto do lote em uma casa.
    expect(consultasDoLote(enderecos)).toHaveLength(enderecos.length)
  })

  it("casa o resultado por posição", () => {
    const r = lerResultadoDoLote(
      [{ lat: -22.7, lon: -47.6 }, { lat: -22.9, lon: -47.0 }, {}],
      3
    )
    expect(r).toEqual([
      { latitude: -22.7, longitude: -47.6 },
      { latitude: -22.9, longitude: -47.0 },
      null,
    ])
  })

  it("resposta curta vira null no fim, nunca deslocamento", () => {
    // O erro que este teste existe pra impedir: se a resposta vier faltando
    // itens e o código encurtasse o array, cada cliente seguinte receberia a
    // coordenada do vizinho — e ninguém percebe isso olhando o mapa.
    const r = lerResultadoDoLote([{ lat: -22.7, lon: -47.6 }], 3)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ latitude: -22.7, longitude: -47.6 })
    expect(r[1]).toBeNull()
    expect(r[2]).toBeNull()
  })

  it("resposta fora de formato não derruba nem inventa coordenada", () => {
    expect(lerResultadoDoLote(null, 2)).toEqual([null, null])
    expect(lerResultadoDoLote({ erro: "x" }, 2)).toEqual([null, null])
    expect(lerResultadoDoLote([{ lat: "n/a", lon: "n/a" }], 1)).toEqual([null])
  })

  it("resposta mais longa que o enviado é truncada", () => {
    expect(lerResultadoDoLote([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], 1)).toHaveLength(1)
  })
})

describe("desistência do job", () => {
  const base = new Date("2026-08-18T12:00:00Z")

  it("job novo continua valendo", () => {
    expect(jobExpirado(new Date("2026-08-18T11:00:00Z"), base)).toBe(false)
  })

  it("job velho é descartado pra fila não travar", () => {
    // Sem isto, um job que o provedor nunca conclui bloquearia o envio do
    // próximo para sempre, e o mapa nunca encheria.
    const velho = new Date(base.getTime() - (HORAS_ATE_DESISTIR + 1) * 3_600_000)
    expect(jobExpirado(velho, base)).toBe(true)
  })
})
