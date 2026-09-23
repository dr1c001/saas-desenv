import { describe, expect, it } from "vitest"
import {
  alcancarHoje,
  DIAS_DE_ANTECEDENCIA,
  deveGerar,
  diasNoMes,
  estaVigente,
  proximaData,
} from "@/lib/contrato-recorrente"

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const txt = (d: Date) => d.toISOString().slice(0, 10)

describe("dias no mês", () => {
  it("acerta os meses curtos e o ano bissexto", () => {
    expect(diasNoMes(2026, 2)).toBe(28)
    expect(diasNoMes(2028, 2)).toBe(29) // bissexto
    expect(diasNoMes(2026, 4)).toBe(30)
    expect(diasNoMes(2026, 12)).toBe(31)
  })
})

describe("próxima data — semanal e quinzenal", () => {
  it("soma 7 e 14 dias", () => {
    expect(txt(proximaData(dia("2026-08-11"), "WEEKLY"))).toBe("2026-08-18")
    expect(txt(proximaData(dia("2026-08-11"), "BIWEEKLY"))).toBe("2026-08-25")
  })

  it("atravessa a virada do mês e do ano", () => {
    expect(txt(proximaData(dia("2026-08-28"), "WEEKLY"))).toBe("2026-09-04")
    expect(txt(proximaData(dia("2026-12-28"), "WEEKLY"))).toBe("2027-01-04")
  })
})

describe("próxima data — mensal e múltiplos", () => {
  it("soma o número certo de meses", () => {
    const d = dia("2026-01-10")
    expect(txt(proximaData(d, "MONTHLY", 10))).toBe("2026-02-10")
    expect(txt(proximaData(d, "BIMONTHLY", 10))).toBe("2026-03-10")
    expect(txt(proximaData(d, "QUARTERLY", 10))).toBe("2026-04-10")
    expect(txt(proximaData(d, "SEMIANNUAL", 10))).toBe("2026-07-10")
    expect(txt(proximaData(d, "ANNUAL", 10))).toBe("2027-01-10")
  })

  it("encolhe pro último dia quando o mês é curto", () => {
    // Contrato no dia 31 em fevereiro só pode cair no dia 28.
    expect(txt(proximaData(dia("2026-01-31"), "MONTHLY", 31))).toBe("2026-02-28")
    expect(txt(proximaData(dia("2026-01-30"), "MONTHLY", 30))).toBe("2026-02-28")
    // Ano bissexto tem 29.
    expect(txt(proximaData(dia("2028-01-31"), "MONTHLY", 31))).toBe("2028-02-29")
  })

  it("VOLTA pro dia escolhido depois do mês curto", () => {
    // A armadilha central. Um contrato no dia 31 executa em 28/fev; a próxima
    // tem que ser 31/mar, NÃO 28/mar. Derivar do dia da execução anterior
    // faria o contrato andar pra trás um pouco a cada mês curto, até virar
    // dia 28 pra sempre — e ninguém notaria por meses.
    const fevereiro = proximaData(dia("2026-01-31"), "MONTHLY", 31)
    expect(txt(fevereiro)).toBe("2026-02-28")
    expect(txt(proximaData(fevereiro, "MONTHLY", 31))).toBe("2026-03-31")
  })

  it("sem dia escolhido, mantém o dia da data atual", () => {
    expect(txt(proximaData(dia("2026-01-15"), "MONTHLY"))).toBe("2026-02-15")
  })

  it("vira o ano corretamente", () => {
    expect(txt(proximaData(dia("2026-11-15"), "QUARTERLY", 15))).toBe("2027-02-15")
    expect(txt(proximaData(dia("2026-12-15"), "MONTHLY", 15))).toBe("2027-01-15")
  })
})

describe("hora de gerar?", () => {
  const hoje = dia("2026-08-11")

  it("gera com a antecedência configurada", () => {
    // A OS nasce antes da visita pra dar tempo de encaixar na rota.
    expect(deveGerar(dia("2026-08-14"), hoje)).toBe(true) // exatamente 3 dias
    expect(deveGerar(dia("2026-08-15"), hoje)).toBe(false) // 4 dias, ainda não
  })

  it("gera o que já venceu", () => {
    expect(deveGerar(dia("2026-08-01"), hoje)).toBe(true)
    expect(deveGerar(hoje, hoje)).toBe(true)
  })

  it("ignora a hora do dia", () => {
    // O cron roda num horário fixo; se comparasse hora, atrasar alguns
    // minutos mudaria o resultado.
    const tarde = new Date("2026-08-14T23:59:00.000Z")
    expect(deveGerar(tarde, new Date("2026-08-11T06:00:00.000Z"))).toBe(true)
  })

  it("usa 3 dias por padrão", () => {
    expect(DIAS_DE_ANTECEDENCIA).toBe(3)
  })
})

describe("vigência", () => {
  const base = { active: true, startsAt: dia("2026-01-01"), endsAt: null }

  it("vale dentro do período", () => {
    expect(estaVigente(base, dia("2026-08-11"))).toBe(true)
  })

  it("não vale antes de começar", () => {
    expect(estaVigente({ ...base, startsAt: dia("2026-09-01") }, dia("2026-08-11"))).toBe(false)
  })

  it("não vale depois de encerrar", () => {
    // Contrato encerrado que continuasse gerando criaria trabalho — e
    // cobrança — pra um cliente que já saiu.
    expect(estaVigente({ ...base, endsAt: dia("2026-07-31") }, dia("2026-08-11"))).toBe(false)
    expect(estaVigente({ ...base, endsAt: dia("2026-08-11") }, dia("2026-08-11"))).toBe(true)
  })

  it("não vale se estiver desativado", () => {
    expect(estaVigente({ ...base, active: false }, dia("2026-08-11"))).toBe(false)
  })
})

describe("recuperar atraso", () => {
  it("avança até a próxima data que faz sentido, sem gerar o passado todo", () => {
    // Cron parado 3 meses: sem isto, um contrato mensal geraria 3 OS de uma
    // vez, todas com data vencida.
    const alcancada = alcancarHoje(dia("2026-05-10"), "MONTHLY", 10, dia("2026-08-11"))
    expect(txt(alcancada)).toBe("2026-09-10")
  })

  it("não mexe no que ainda não venceu", () => {
    expect(txt(alcancarHoje(dia("2026-09-10"), "MONTHLY", 10, dia("2026-08-11")))).toBe("2026-09-10")
  })

  it("para no teto de saltos em vez de girar sem fim", () => {
    // Proteção contra data absurda vinda de dado corrompido.
    const r = alcancarHoje(dia("1990-01-10"), "MONTHLY", 10, dia("2026-08-11"), 5)
    expect(txt(r)).toBe("1990-06-10")
  })
})
