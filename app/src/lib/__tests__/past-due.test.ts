import { describe, expect, it } from "vitest"
import {
  AVISOS_ATRASO,
  PAST_DUE_GRACE_DAYS,
  decidirAviso,
  diasDeAtraso,
  momentoDoAviso,
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
    expect(d.diasRestantes).toBe(29)
  })

  it("não repete no 2º dia", () => {
    // O cron roda todo dia. Sem esta trava, o cliente receberia o mesmo
    // e-mail trinta vezes seguidas.
    expect(decidirAviso(2, 1).enviar).toBe(false)
  })

  it("avisa de novo no 3º dia", () => {
    const d = decidirAviso(3, 1)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(2)
    expect(d.diasRestantes).toBe(27)
  })

  it("a régua inteira: sete avisos, um por marco", () => {
    // Apertada no começo (1, 3) porque a maioria das falhas de cobrança é boba
    // e se resolve no mesmo dia. Espaçada depois, para não virar perseguição a
    // quem já sabe que deve.
    expect([...AVISOS_ATRASO]).toEqual([1, 3, 10, 15, 20, 25, 30])

    let enviados = 0
    for (const marco of AVISOS_ATRASO) {
      const d = decidirAviso(marco, enviados)
      expect(d.enviar, `marco ${marco}`).toBe(true)
      enviados = d.total
    }
    expect(enviados).toBe(7)
  })

  it("nos dias entre marcos, não sai nada", () => {
    for (const dia of [2, 5, 8, 12, 18, 23, 28]) {
      const jaEnviados = AVISOS_ATRASO.filter((m) => dia >= m).length
      expect(decidirAviso(dia, jaEnviados).enviar, `dia ${dia}`).toBe(false)
    }
  })

  it("para depois do último aviso", () => {
    expect(decidirAviso(31, 7).enviar).toBe(false)
    expect(decidirAviso(90, 7).enviar).toBe(false)
  })

  it("cron falhou nos dias 1 e 2: no dia 3 manda UM aviso, o mais urgente", () => {
    // O caso que motivou contar marcos em vez de comparar data exata. O cron
    // de NPS já teve exatamente este defeito e perdia o envio pra sempre.
    const d = decidirAviso(3, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(2) // pula direto pro segundo marco
    expect(d.diasRestantes).toBe(27)
  })

  it("cron ficou um mês fora: ainda manda um único aviso, o do bloqueio", () => {
    const d = decidirAviso(31, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(AVISOS_ATRASO.length)
    expect(d.momento).toBe("bloqueio")
  })

  it("dias restantes nunca fica negativo", () => {
    expect(decidirAviso(99, 2).diasRestantes).toBe(0)
  })

  it("nenhum aviso chega DEPOIS do corte", () => {
    // Um e-mail dizendo "faltam X dias" com o acesso já bloqueado é pior que
    // não avisar. Nenhum marco pode passar da carência.
    for (const marco of AVISOS_ATRASO) {
      expect(marco, `marco ${marco}`).toBeLessThanOrEqual(PAST_DUE_GRACE_DAYS)
    }
  })

  it("todos os marcos MENOS o último são aviso de verdade, com prazo restante", () => {
    const antesDoCorte = AVISOS_ATRASO.filter((m) => m < PAST_DUE_GRACE_DAYS)
    expect(antesDoCorte.length).toBe(AVISOS_ATRASO.length - 1)
    for (const marco of antesDoCorte) {
      expect(decidirAviso(marco, 0).diasRestantes, `marco ${marco}`).toBeGreaterThan(0)
    }
  })

  it("o último marco COINCIDE com o corte, e é o aviso de bloqueio", () => {
    const ultimo = AVISOS_ATRASO[AVISOS_ATRASO.length - 1]
    expect(ultimo).toBe(PAST_DUE_GRACE_DAYS)

    const d = decidirAviso(ultimo, 6)
    expect(d.enviar).toBe(true)
    expect(d.diasRestantes).toBe(0)
    expect(d.momento).toBe("bloqueio")
  })
})

describe("past-due — o tom de cada aviso", () => {
  it("escala de lembrete para aperto e depois corte", () => {
    expect(momentoDoAviso(29)).toBe("aviso")
    expect(momentoDoAviso(10)).toBe("aviso")
    expect(momentoDoAviso(5)).toBe("urgente")
    expect(momentoDoAviso(1)).toBe("urgente")
    expect(momentoDoAviso(0)).toBe("bloqueio")
  })

  it("zero não é 'resta pouco', é o dia do corte", () => {
    // Dizer "faltam 0 dias" a quem acabou de perder o acesso é pior que não
    // avisar. Por isso o dia do corte tem TEXTO PRÓPRIO, não o mesmo com
    // número zero.
    expect(momentoDoAviso(0)).not.toBe("urgente")
    expect(momentoDoAviso(-3)).toBe("bloqueio")
  })

  it("cada marco da régua tem um tom, e a escala nunca anda para trás", () => {
    const ordem = { aviso: 0, urgente: 1, bloqueio: 2 }
    let anterior = -1
    for (const marco of AVISOS_ATRASO) {
      const atual = ordem[decidirAviso(marco, 0).momento]
      expect(atual, `marco ${marco}`).toBeGreaterThanOrEqual(anterior)
      anterior = atual
    }
    expect(anterior).toBe(ordem.bloqueio)
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
