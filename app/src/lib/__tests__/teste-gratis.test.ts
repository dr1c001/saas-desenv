import { describe, expect, it } from "vitest"
import {
  AVISOS_DE_FIM,
  decidirAvisoDeFim,
  diasRestantes,
  DIAS_DE_TESTE,
  fimDoTeste,
  testeAtivo,
} from "@/lib/teste-gratis"

// O teste grátis de 15 dias.
//
// Ele existiu, foi removido em 21/07/2026 por decisão de produto, e voltou em
// 08/09/2026 com o produto focado num nicho só.

const agora = new Date("2026-09-08T12:00:00Z")

describe("quanto dura", () => {
  it("são quinze dias", () => {
    expect(DIAS_DE_TESTE).toBe(15)
  })

  it("quem se cadastra às 23h não perde um dia por causa da hora", () => {
    // "Agora + 15 dias" tiraria quase um dia inteiro de quem criou a conta
    // tarde da noite. O fim é a virada do dia, e não o instante do cadastro.
    const cedo = fimDoTeste(new Date("2026-09-08T09:00:00Z"))
    const tarde = fimDoTeste(new Date("2026-09-08T23:59:00Z"))
    expect(cedo.getTime()).toBe(tarde.getTime())
  })

  it("o fim cai depois do último dia, e não no meio dele", () => {
    const fim = fimDoTeste(new Date("2026-09-08T12:00:00Z"))
    // 15 dias de teste: o dia 23/09 ainda é de teste, o 24/09 já não é.
    expect(testeAtivo(fim, new Date("2026-09-23T20:00:00Z"))).toBe(true)
    expect(testeAtivo(fim, new Date("2026-09-24T12:00:00Z"))).toBe(false)
  })
})

describe("quem tem acesso", () => {
  const fim = new Date("2026-09-20T03:00:00Z")

  it("dentro do prazo, sim", () => {
    expect(testeAtivo(fim, agora)).toBe(true)
  })

  it("depois do prazo, não", () => {
    expect(testeAtivo(fim, new Date("2026-09-21T12:00:00Z"))).toBe(false)
  })

  it("SEM data de fim, NÃO", () => {
    // É o estado das empresas criadas enquanto não havia trial. Liberá-las
    // agora reabriria o sistema de graça para quem parou de pagar — o oposto do
    // que o retorno do teste quer fazer.
    expect(testeAtivo(null, agora)).toBe(false)
    expect(testeAtivo(undefined, agora)).toBe(false)
  })
})

describe("a contagem que aparece na tela", () => {
  it("arredonda para CIMA", () => {
    // Faltando seis horas, a tela diz "1 dia" e não "0 dias". Zero é o que se
    // mostra a quem já perdeu o acesso.
    const daqui6h = new Date(agora.getTime() + 6 * 60 * 60 * 1000)
    expect(diasRestantes(daqui6h, agora)).toBe(1)
  })

  it("prazo vencido é zero, e não negativo", () => {
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    expect(diasRestantes(ontem, agora)).toBe(0)
  })

  it("sem data, zero", () => {
    expect(diasRestantes(null, agora)).toBe(0)
  })
})

describe("os avisos de que o teste está acabando", () => {
  it("são três, e o último é véspera", () => {
    // Um só, no último dia, não dá tempo de decidir, falar com sócio nem passar
    // no cartão. E mais que três é importunar.
    expect([...AVISOS_DE_FIM]).toEqual([7, 3, 1])
  })

  it("avisa nos marcos, e uma vez em cada", () => {
    let enviados = 0
    const avisados: number[] = []
    for (let dias = 15; dias >= 1; dias--) {
      const d = decidirAvisoDeFim(dias, enviados)
      if (d.enviar) {
        avisados.push(dias)
        enviados = d.total
      }
    }
    expect(avisados).toEqual([7, 3, 1])
  })

  it("rodar duas vezes no mesmo dia manda UM e-mail", () => {
    const primeira = decidirAvisoDeFim(7, 0)
    const segunda = decidirAvisoDeFim(7, primeira.total)

    expect(primeira.enviar).toBe(true)
    expect(segunda.enviar).toBe(false)
    expect(segunda.total).toBe(primeira.total)
  })

  it("cron fora do ar por dias NÃO despeja a escada inteira", () => {
    // Pulou de 10 para 2 dias restantes: manda UM aviso, o do marco mais
    // recente. Receber "faltam 7 dias" e "falta 1 dia" no mesmo minuto é pior
    // que ter recebido só o segundo.
    const d = decidirAvisoDeFim(2, 0)
    expect(d.enviar).toBe(true)
    expect(d.total).toBe(2) // os marcos 7 e 3 ficaram para trás
    expect(d.diasRestantes).toBe(2)
  })

  it("depois do fim do teste, para de avisar", () => {
    // Quem já perdeu o acesso vê a tela de assinatura; insistir por e-mail
    // depois disso é cobrança, não lembrete.
    expect(decidirAvisoDeFim(0, 2).enviar).toBe(false)
    expect(decidirAvisoDeFim(-5, 2).enviar).toBe(false)
  })

  it("quem já recebeu os três não recebe um quarto", () => {
    expect(decidirAvisoDeFim(1, AVISOS_DE_FIM.length).enviar).toBe(false)
  })
})
