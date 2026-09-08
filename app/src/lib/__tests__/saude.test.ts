import { describe, expect, it } from "vitest"
import { diagnosticar, statusHttp, HORAS_ATE_ALARMAR, type Entrada } from "@/lib/saude"

const AGORA = new Date("2026-08-19T12:00:00.000Z")
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000)

const base: Entrada = {
  bancoRespondeu: true,
  ultimoCronOk: horasAtras(2),
  primeiroRegistroEm: horasAtras(24 * 30),
  agora: AGORA,
}

describe("diagnóstico", () => {
  it("tudo respondendo é saudável", () => {
    const d = diagnosticar(base)
    expect(d.estado).toBe("saudavel")
    expect(d.checagens).toEqual({ banco: "saudavel", cron: "saudavel" })
  })

  it("banco fora derruba o diagnóstico inteiro", () => {
    const d = diagnosticar({ ...base, bancoRespondeu: false })
    expect(d.estado).toBe("degradado")
    expect(d.checagens.banco).toBe("degradado")
    // O cron continua saudável: a resposta precisa dizer O QUE está ruim.
    expect(d.checagens.cron).toBe("saudavel")
  })

  it("cron parado derruba, mesmo com o banco de pé", () => {
    // É o caso que este módulo existe pra pegar: o site responde, tudo parece
    // bem, e há três dias ninguém recebe cobrança nem aviso de atraso.
    const d = diagnosticar({ ...base, ultimoCronOk: horasAtras(72) })
    expect(d.estado).toBe("degradado")
    expect(d.checagens.cron).toBe("degradado")
    expect(d.checagens.banco).toBe("saudavel")
  })

  it("atraso normal não alarma", () => {
    // A Vercel não garante o minuto exato. Alarme que dispara por atraso
    // normal é alarme que a pessoa aprende a ignorar — e aí ele não funciona
    // no dia real.
    expect(diagnosticar({ ...base, ultimoCronOk: horasAtras(25) }).checagens.cron).toBe("saudavel")
    expect(diagnosticar({ ...base, ultimoCronOk: horasAtras(HORAS_ATE_ALARMAR) }).checagens.cron).toBe(
      "saudavel"
    )
  })

  it("alarma logo depois de passar da tolerância", () => {
    expect(
      diagnosticar({ ...base, ultimoCronOk: horasAtras(HORAS_ATE_ALARMAR + 0.5) }).checagens.cron
    ).toBe("degradado")
  })

  it("monitoramento recém-ligado não nasce vermelho", () => {
    // Nunca rodou o cron porque o monitoramento acabou de subir. Alarmar aqui
    // ensinaria a pessoa a ignorar o monitor antes mesmo de ele servir pra
    // algo — e foi exatamente o que aconteceu na primeira consulta em
    // producao, quando a referencia era a idade da EMPRESA. (19/08/2026.)
    const d = diagnosticar({
      ...base,
      ultimoCronOk: null,
      primeiroRegistroEm: horasAtras(3),
    })
    expect(d.checagens.cron).toBe("saudavel")
    expect(d.horasDesdeOCron).toBeNull()
  })

  it("mas dias observando sem nenhum cron É problema", () => {
    // Passou tempo mais que suficiente pra um cron ter acontecido DESDE QUE
    // se passou a observar, e não aconteceu nenhum. Isso é o cron nunca ter
    // sido agendado de verdade.
    const d = diagnosticar({
      ...base,
      ultimoCronOk: null,
      primeiroRegistroEm: horasAtras(24 * 5),
    })
    expect(d.checagens.cron).toBe("degradado")
  })

  it("sem nenhum registro de vida, não inventa alarme", () => {
    // Banco vazio, primeira subida. Não há informação pra afirmar nada.
    const d = diagnosticar({
      ...base,
      ultimoCronOk: null,
      primeiroRegistroEm: null,
    })
    expect(d.checagens.cron).toBe("saudavel")
  })

  it("relata as horas desde o último cron, arredondadas", () => {
    expect(diagnosticar({ ...base, ultimoCronOk: horasAtras(3.14159) }).horasDesdeOCron).toBe(3.1)
  })
})

describe("código HTTP", () => {
  it("saudável responde 200", () => {
    expect(statusHttp(diagnosticar(base))).toBe(200)
  })

  it("degradado responde 503, e não 200 com aviso no corpo", () => {
    // É o detalhe que faz tudo funcionar: monitor de uptime alerta em resposta
    // não-2xx e não lê corpo por padrão. Um 200 dizendo "degradado" seria
    // bonito e completamente inútil.
    expect(statusHttp(diagnosticar({ ...base, bancoRespondeu: false }))).toBe(503)
    expect(statusHttp(diagnosticar({ ...base, ultimoCronOk: horasAtras(99) }))).toBe(503)
  })
})
