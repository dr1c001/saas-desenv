import { describe, expect, it } from "vitest"
import { IA_COMANDOS_PADRAO } from "@/lib/recursos"
import { aposConsumir, estadoDaCota, limiteDeComandos, porQueNaoPode } from "@/lib/ia/cota"

// A cota é a condição para vender a assistente. Ela é o primeiro recurso do
// sistema com custo por uso: sem teto, o cliente que mais usa é o que menos dá
// lucro, e ninguém descobre isso antes da fatura.

const agora = new Date("2026-08-23T12:00:00Z")

describe("o teto de comandos", () => {
  it("sem ajuste, herda a franquia do adicional — nunca zero", () => {
    // O que se herda NÃO vem do plano: nenhum plano inclui a assistente. Se
    // herdasse do plano, conceder o adicional daria teto zero, e o cliente
    // pagaria por algo que não funciona.
    expect(limiteDeComandos(null)).toBe(IA_COMANDOS_PADRAO)
  })

  it("zero é SEM LIMITE, como no resto do sistema", () => {
    expect(limiteDeComandos(0)).toBeNull()
  })

  it("um número é o teto daquela empresa", () => {
    expect(limiteDeComandos(2000)).toBe(2000)
  })
})

describe("onde a empresa está na cota", () => {
  it("conta o que já foi usado no mês corrente", () => {
    const c = estadoDaCota({ usado: 30, mesGravado: "2026-08", override: 100, agora })
    expect(c).toMatchObject({ mes: "2026-08", usado: 30, limite: 100, podeUsar: true, restam: 70 })
  })

  it("no teto, para", () => {
    const c = estadoDaCota({ usado: 100, mesGravado: "2026-08", override: 100, agora })
    expect(c.podeUsar).toBe(false)
    expect(c.restam).toBe(0)
  })

  it("passou do teto continua parado, e não devolve negativo", () => {
    // Uma corrida entre dois comandos simultâneos pode passar de 100 por um.
    // "Restam -1" na tela seria uma confissão de bug para o cliente ler.
    const c = estadoDaCota({ usado: 105, mesGravado: "2026-08", override: 100, agora })
    expect(c.podeUsar).toBe(false)
    expect(c.restam).toBe(0)
  })

  it("contagem de OUTRO mês não vale para este", () => {
    // A virada acontece na LEITURA, e não num cron: um cron que falha numa
    // madrugada deixaria a empresa barrada no dia 1 sem motivo visível.
    const c = estadoDaCota({ usado: 500, mesGravado: "2026-07", override: 100, agora })
    expect(c.usado).toBe(0)
    expect(c.podeUsar).toBe(true)
    expect(c.virouOMes).toBe(true)
  })

  it("empresa que nunca usou começa em zero", () => {
    const c = estadoDaCota({ usado: 0, mesGravado: null, override: null, agora })
    expect(c.usado).toBe(0)
    expect(c.podeUsar).toBe(true)
    expect(c.virouOMes).toBe(false)
  })

  it("sem limite nunca esgota", () => {
    const c = estadoDaCota({ usado: 999_999, mesGravado: "2026-08", override: 0, agora })
    expect(c.podeUsar).toBe(true)
    expect(c.restam).toBeNull()
  })

  it("o mês é o de BRASÍLIA, não o de UTC", () => {
    // 1º de setembro às 02:00 UTC ainda é 31 de agosto no Brasil. Virar a cota
    // cedo demais devolveria franquia que a empresa ainda não tem.
    const madrugada = new Date("2026-09-01T02:00:00Z")
    expect(estadoDaCota({ usado: 5, mesGravado: "2026-08", override: 10, agora: madrugada }).mes).toBe(
      "2026-08"
    )
  })

  it("usado negativo no banco não vira crédito", () => {
    const c = estadoDaCota({ usado: -50, mesGravado: "2026-08", override: 10, agora })
    expect(c.usado).toBe(0)
    expect(c.restam).toBe(10)
  })
})

describe("o que se grava depois de um comando", () => {
  it("soma um e carimba o mês", () => {
    const c = estadoDaCota({ usado: 7, mesGravado: "2026-08", override: 100, agora })
    expect(aposConsumir(c)).toEqual({ iaComandosNoMes: 8, iaMesDoContador: "2026-08" })
  })

  it("no primeiro comando do mês novo, recomeça em 1", () => {
    // Sem isto, a contagem do mês passado continuaria somando e a empresa
    // gastaria a franquia nova já esgotada.
    const c = estadoDaCota({ usado: 500, mesGravado: "2026-07", override: 100, agora })
    expect(aposConsumir(c)).toEqual({ iaComandosNoMes: 1, iaMesDoContador: "2026-08" })
  })
})

describe("por que a assistente não pode responder", () => {
  const cheia = estadoDaCota({ usado: 0, mesGravado: null, override: null, agora })
  const vazia = estadoDaCota({ usado: 100, mesGravado: "2026-08", override: 100, agora })

  it("tudo certo devolve null", () => {
    expect(porQueNaoPode({ temRecurso: true, temChave: true, cota: cheia })).toBeNull()
  })

  it("quem não contratou o adicional ouve isso, e não 'acabou a franquia'", () => {
    // Nunca teve franquia nenhuma. Dizer que acabou mandaria a pessoa procurar
    // um limite que não existe, em vez de falar com o comercial.
    expect(porQueNaoPode({ temRecurso: false, temChave: true, cota: vazia })).toBe("semRecurso")
  })

  it("falta de chave vem ANTES da cota", () => {
    // Falha nossa, não do cliente. E seria péssimo consumir a franquia de
    // alguém num comando que nem chegou a sair.
    expect(porQueNaoPode({ temRecurso: true, temChave: false, cota: cheia })).toBe("semChave")
  })

  it("franquia esgotada, com tudo o mais certo", () => {
    expect(porQueNaoPode({ temRecurso: true, temChave: true, cota: vazia })).toBe("cotaEsgotada")
  })
})
