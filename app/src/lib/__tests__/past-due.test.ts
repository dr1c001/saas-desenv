import { describe, expect, it } from "vitest"
import {
  AVISOS_ATRASO,
  PAST_DUE_GRACE_DAYS,
  decidirAviso,
  diasDeAtraso,
} from "@/lib/past-due"

// Esta regra decide quando o cliente é avisado antes de perder o acesso. Erra
// pra mais: e-mail repetido todo dia até o corte. Erra pra menos: a equipe
// inteira do cliente para sem nunca ter sido avisada. Nenhum dos dois dá erro
// visível em lugar nenhum — só aparece na reclamação ou no cancelamento.

describe("past-due — regra dos avisos", () => {
  it("não avisa no dia do vencimento", () => {
    expect(decidirAviso(0, 0).enviar).toBe(false)
  })

  it("avisa no 1º dia de atraso", () => {
    const d = decidirAviso(1, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(1)
    expect(d.diasRestantes).toBe(4)
  })

  it("não repete no 2º dia", () => {
    // O cron roda todo dia. Sem esta trava, o cliente receberia o mesmo
    // e-mail cinco vezes seguidas.
    expect(decidirAviso(2, 1).enviar).toBe(false)
  })

  it("avisa de novo no 3º dia", () => {
    const d = decidirAviso(3, 1)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(2)
    expect(d.diasRestantes).toBe(2)
  })

  it("para depois do segundo aviso", () => {
    expect(decidirAviso(4, 2).enviar).toBe(false)
    expect(decidirAviso(5, 2).enviar).toBe(false)
    expect(decidirAviso(30, 2).enviar).toBe(false)
  })

  it("cron falhou nos dias 1 e 2: no dia 3 manda UM aviso, o mais urgente", () => {
    // O caso que motivou contar marcos em vez de comparar data exata. O cron
    // de NPS já teve exatamente este defeito e perdia o envio pra sempre.
    const d = decidirAviso(3, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(2) // pula direto pro segundo marco
    expect(d.diasRestantes).toBe(2) // e o texto é o urgente, não o do dia 1
  })

  it("cron ficou uma semana fora: ainda manda um único aviso", () => {
    const d = decidirAviso(9, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(AVISOS_ATRASO.length)
  })

  it("dias restantes nunca fica negativo", () => {
    expect(decidirAviso(99, 2).diasRestantes).toBe(0)
  })

  it("o último aviso sai antes do corte, nunca depois", () => {
    // Se um marco de aviso fosse >= à carência, o e-mail chegaria com o
    // acesso já bloqueado — pior que não avisar.
    for (const marco of AVISOS_ATRASO) {
      expect(marco).toBeLessThan(PAST_DUE_GRACE_DAYS)
      expect(decidirAviso(marco, 0).diasRestantes).toBeGreaterThan(0)
    }
  })
})

describe("past-due — contagem de dias", () => {
  const fim = new Date("2026-08-10T03:00:00Z")

  it("conta dias inteiros", () => {
    expect(diasDeAtraso(fim, new Date("2026-08-10T03:00:00Z"))).toBe(0)
    expect(diasDeAtraso(fim, new Date("2026-08-11T03:00:00Z"))).toBe(1)
    expect(diasDeAtraso(fim, new Date("2026-08-13T03:00:00Z"))).toBe(3)
  })

  it("algumas horas depois do vencimento ainda é dia 0", () => {
    // O cron roda 09:00 BRT. Sem arredondar pra baixo, um vencimento à
    // meia-noite viraria "1 dia de atraso" na mesma manhã.
    expect(diasDeAtraso(fim, new Date("2026-08-10T20:00:00Z"))).toBe(0)
  })
})
