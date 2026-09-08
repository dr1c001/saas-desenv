import { describe, expect, it } from "vitest"
import {
  diasDeGarantia,
  garantiaAte,
  garantiaVigente,
  prazoPorExtenso,
} from "@/lib/garantia"

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const txt = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null

describe("qual prazo vale", () => {
  it("a OS manda quando tem valor proprio", () => {
    expect(diasDeGarantia(30, 90)).toBe(30)
  })

  it("cai no padrao da empresa quando a OS nao define", () => {
    expect(diasDeGarantia(null, 90)).toBe(90)
    expect(diasDeGarantia(undefined, 90)).toBe(90)
  })

  it("ZERO na OS sobrepoe o padrao", () => {
    // "Sem garantia" e uma escolha legitima. Se a checagem fosse por valor
    // falso, um servico deliberadamente sem garantia herdaria os 90 dias da
    // empresa — e a empresa se veria obrigada a honrar algo que nao ofereceu.
    expect(diasDeGarantia(0, 90)).toBe(0)
  })

  it("sem nada definido, nao ha garantia", () => {
    expect(diasDeGarantia(null, null)).toBeNull()
  })
})

describe("ate quando vale", () => {
  it("conta da CONCLUSAO, nao da abertura", () => {
    // Uma OS aberta em janeiro e concluida em marco tem garantia ate junho.
    expect(txt(garantiaAte(dia("2026-03-15"), 90))).toBe("2026-06-13")
  })

  it("atravessa a virada do ano", () => {
    expect(txt(garantiaAte(dia("2026-12-20"), 30))).toBe("2027-01-19")
  })

  it("nao ha data enquanto a OS nao foi concluida", () => {
    expect(garantiaAte(null, 90)).toBeNull()
  })

  it("prazo zero ou ausente nao gera data", () => {
    expect(garantiaAte(dia("2026-03-15"), 0)).toBeNull()
    expect(garantiaAte(dia("2026-03-15"), null)).toBeNull()
  })
})

describe("ainda esta valendo?", () => {
  const vence = dia("2026-06-13")

  it("vale ate o ultimo dia, inclusive", () => {
    expect(garantiaVigente(vence, dia("2026-06-13"))).toBe(true)
    expect(garantiaVigente(vence, dia("2026-06-12"))).toBe(true)
  })

  it("nao vale no dia seguinte", () => {
    expect(garantiaVigente(vence, dia("2026-06-14"))).toBe(false)
  })

  it("sem data, nao vale", () => {
    expect(garantiaVigente(null, dia("2026-01-01"))).toBe(false)
  })
})

describe("prazo por extenso", () => {
  const t = (chave: string, vals?: Record<string, number>) =>
    vals ? `${chave}:${Object.values(vals)[0]}` : chave

  it("fala em meses e anos quando o numero e redondo", () => {
    // "90 dias" esta correto, mas "3 meses" e o que a pessoa entende sem
    // precisar pensar.
    expect(prazoPorExtenso(90, t)).toBe("garantia.meses:3")
    expect(prazoPorExtenso(365, t)).toBe("garantia.anos:1")
    expect(prazoPorExtenso(730, t)).toBe("garantia.anos:2")
  })

  it("mantem em dias quando nao e redondo", () => {
    expect(prazoPorExtenso(45, t)).toBe("garantia.dias:45")
    expect(prazoPorExtenso(7, t)).toBe("garantia.dias:7")
  })

  it("zero vira 'sem garantia', nao '0 dias'", () => {
    expect(prazoPorExtenso(0, t)).toBe("garantia.semGarantia")
  })
})
