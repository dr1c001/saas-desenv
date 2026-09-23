import { describe, expect, it } from "vitest"
import { resumo, ultimosDias, type ExecucaoCrua } from "@/lib/status"

const HOJE = new Date("2026-08-19T15:00:00.000Z")
const em = (dia: string, hora = "12:00:00") => new Date(`${dia}T${hora}.000Z`)

describe("histórico de dias", () => {
  it("devolve a janela pedida, do mais antigo pro mais novo", () => {
    const dias = ultimosDias([], HOJE, 5)
    expect(dias).toHaveLength(5)
    expect(dias[0].data).toBe("2026-08-15")
    expect(dias[4].data).toBe("2026-08-19")
  })

  it("dia com execução boa fica ok", () => {
    const dias = ultimosDias([{ startedAt: em("2026-08-18"), ok: true }], HOJE, 3)
    expect(dias.find((d) => d.data === "2026-08-18")?.estado).toBe("ok")
  })

  it("dia com execução falha fica falhou", () => {
    const dias = ultimosDias([{ startedAt: em("2026-08-18"), ok: false }], HOJE, 3)
    expect(dias.find((d) => d.data === "2026-08-18")?.estado).toBe("falhou")
  })

  it("uma execução boa salva o dia, mesmo depois de uma falha", () => {
    // O cron pode ser reexecutado. O que importa pro cliente é se o trabalho
    // daquele dia aconteceu, não quantas tentativas foram precisas.
    const execucoes: ExecucaoCrua[] = [
      { startedAt: em("2026-08-18", "12:00:00"), ok: false },
      { startedAt: em("2026-08-18", "13:00:00"), ok: true },
    ]
    expect(ultimosDias(execucoes, HOJE, 3).find((d) => d.data === "2026-08-18")?.estado).toBe("ok")
  })

  it("dia sem registro NÃO é falha", () => {
    // Ausência de informação e falha são coisas diferentes, e precisam ser
    // distinguíveis na tela. Antes de o registro existir, o histórico inteiro
    // é cinza — afirmar "falhou" ali seria inventar um passado ruim que
    // ninguém observou.
    const dias = ultimosDias([{ startedAt: em("2026-08-19"), ok: true }], HOJE, 3)
    expect(dias.find((d) => d.data === "2026-08-17")?.estado).toBe("sem-registro")
    expect(dias.find((d) => d.data === "2026-08-19")?.estado).toBe("ok")
  })

  it("ignora execução fora da janela sem quebrar", () => {
    const dias = ultimosDias([{ startedAt: em("2020-01-01"), ok: true }], HOJE, 3)
    expect(dias.every((d) => d.estado === "sem-registro")).toBe(true)
  })

  it("agrupa por dia UTC, a mesma base do agendamento", () => {
    // O cron roda 12:00 UTC. Agrupar por fuso local jogaria a execução da
    // madrugada pro dia anterior e o histórico não bateria com a realidade.
    const dias = ultimosDias([{ startedAt: em("2026-08-18", "23:30:00"), ok: true }], HOJE, 3)
    expect(dias.find((d) => d.data === "2026-08-18")?.estado).toBe("ok")
  })
})

describe("resumo", () => {
  it("conta sobre os dias OBSERVADOS, não sobre a janela inteira", () => {
    // Um sistema que passou a registrar ontem apareceria como "1 de 30", que
    // leria como catástrofe — quando na verdade não houve falha nenhuma.
    const dias = ultimosDias([{ startedAt: em("2026-08-19"), ok: true }], HOJE, 30)
    expect(resumo(dias)).toEqual({ bons: 1, observados: 1 })
  })

  it("conta falha entre os observados", () => {
    const dias = ultimosDias(
      [
        { startedAt: em("2026-08-18"), ok: true },
        { startedAt: em("2026-08-19"), ok: false },
      ],
      HOJE,
      30
    )
    expect(resumo(dias)).toEqual({ bons: 1, observados: 2 })
  })

  it("sem nenhum registro, não afirma nada", () => {
    expect(resumo(ultimosDias([], HOJE, 30))).toEqual({ bons: 0, observados: 0 })
  })
})
