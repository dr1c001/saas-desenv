import { describe, expect, it } from "vitest"
import {
  comDiaTrocado,
  conflitos,
  motivoParaNaoReagendar,
  podeReagendar,
  type Agendado,
} from "@/lib/agenda"

describe("o que pode ser arrastado", () => {
  it("OS aberta e em andamento podem ser reagendadas", () => {
    expect(podeReagendar("OPEN")).toBe(true)
    expect(podeReagendar("IN_PROGRESS")).toBe(true)
  })

  it("concluída, faturada e cancelada ficam presas, cada uma com seu motivo", () => {
    // O motivo aparece na tela quando a pessoa tenta arrastar. "Não pode" sem
    // explicação faz o usuário tentar de novo achando que errou a mira.
    expect(motivoParaNaoReagendar("DONE")).toBe("concluida")
    expect(motivoParaNaoReagendar("INVOICED")).toBe("faturada")
    expect(motivoParaNaoReagendar("CANCELLED")).toBe("cancelada")
  })

  it("status desconhecido não trava — o padrão é permitir", () => {
    // Se um status novo aparecer, a agenda continua funcionando. Travar por
    // padrão faria a agenda parar de funcionar em silêncio ao adicionar um
    // status ao sistema.
    expect(podeReagendar("QUALQUER_COISA")).toBe(true)
  })
})

describe("a hora sobrevive ao arrasto", () => {
  it("mudar o dia mantém hora, minuto e segundo", () => {
    const original = new Date(2026, 7, 5, 14, 30, 15)

    const nova = comDiaTrocado(original, 2026, 8, 12)

    expect(nova.getFullYear()).toBe(2026)
    expect(nova.getMonth()).toBe(7)
    expect(nova.getDate()).toBe(12)
    expect(nova.getHours()).toBe(14)
    expect(nova.getMinutes()).toBe(30)
    expect(nova.getSeconds()).toBe(15)
  })

  it("arrastar para outro mês também mantém a hora", () => {
    const nova = comDiaTrocado(new Date(2026, 7, 31, 9, 0), 2026, 9, 1)

    expect(nova.getMonth()).toBe(8)
    expect(nova.getDate()).toBe(1)
    expect(nova.getHours()).toBe(9)
  })

  it("não altera a data original", () => {
    const original = new Date(2026, 7, 5, 14, 0)
    comDiaTrocado(original, 2026, 8, 20)
    expect(original.getDate()).toBe(5)
  })
})

describe("aviso de conflito", () => {
  const os = (id: string, responsavel: string | null, quando: Date): Agendado => ({
    id,
    responsavel,
    quando,
  })

  it("acusa outro serviço do MESMO responsável no mesmo horário", () => {
    const agenda = [os("a", "Carlos", new Date(2026, 7, 12, 14, 0))]

    const r = conflitos(agenda, os("b", "Carlos", new Date(2026, 7, 12, 14, 30)))

    expect(r.map((x) => x.id)).toEqual(["a"])
  })

  it("não acusa responsável diferente no mesmo horário", () => {
    // Dois técnicos às 14h é o normal de uma empresa com equipe.
    const agenda = [os("a", "Carlos", new Date(2026, 7, 12, 14, 0))]

    expect(conflitos(agenda, os("b", "Ana", new Date(2026, 7, 12, 14, 0)))).toEqual([])
  })

  it("não acusa o mesmo responsável em horários distantes", () => {
    const agenda = [os("a", "Carlos", new Date(2026, 7, 12, 9, 0))]

    expect(conflitos(agenda, os("b", "Carlos", new Date(2026, 7, 12, 15, 0)))).toEqual([])
  })

  it("OS sem responsável nunca conflita", () => {
    // Ainda não é de ninguém: não há agenda de pessoa para conflitar.
    const agenda = [os("a", null, new Date(2026, 7, 12, 14, 0))]

    expect(conflitos(agenda, os("b", null, new Date(2026, 7, 12, 14, 0)))).toEqual([])
  })

  it("a OS movida não conflita consigo mesma", () => {
    // Ela está na agenda que veio do servidor. Sem o filtro por id, todo
    // arrasto acusaria conflito com a própria OS que está sendo movida.
    const agenda = [os("a", "Carlos", new Date(2026, 7, 12, 14, 0))]

    expect(conflitos(agenda, os("a", "Carlos", new Date(2026, 7, 12, 14, 0)))).toEqual([])
  })

  it("acusa todos os conflitos, não só o primeiro", () => {
    const agenda = [
      os("a", "Carlos", new Date(2026, 7, 12, 14, 0)),
      os("b", "Carlos", new Date(2026, 7, 12, 14, 15)),
      os("c", "Carlos", new Date(2026, 7, 12, 20, 0)),
    ]

    const r = conflitos(agenda, os("nova", "Carlos", new Date(2026, 7, 12, 14, 10)))

    expect(r.map((x) => x.id)).toEqual(["a", "b"])
  })
})
