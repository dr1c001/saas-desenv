import { describe, expect, it } from "vitest"
import {
  desligadasValidas,
  ehFuncao,
  FUNCOES,
  FUNCOES_COM_CUSTO,
  funcaoLigada,
} from "@/lib/funcoes"
import { RECURSOS } from "@/lib/recursos"

// A regra que estes testes protegem: função NASCE LIGADA. É a única forma
// segura de criar interruptor para coisa que já está em uso por todo mundo —
// uma lista de "ligadas" começaria vazia e apagaria o sistema de todos os
// clientes no dia do deploy.

describe("o catálogo", () => {
  it("não tem repetido", () => {
    expect(new Set(FUNCOES).size).toBe(FUNCOES.length)
  })

  it("não se confunde com os recursos de plano", () => {
    // São conceitos opostos: recurso nasce DESLIGADO e o plano liga; função
    // nasce LIGADA e o painel desliga. Uma chave nos dois catálogos teria dois
    // padrões contraditórios ao mesmo tempo.
    const emAmbos = FUNCOES.filter((f) => (RECURSOS as readonly string[]).includes(f))
    expect(emAmbos).toEqual([])
  })

  it("as que custam dinheiro estão no catálogo", () => {
    for (const f of FUNCOES_COM_CUSTO) {
      expect(FUNCOES, f).toContain(f)
    }
  })

  it("NÃO oferece desligar o que é nosso ou o que é o próprio produto", () => {
    // Desligar cobrança, login ou backup para uma empresa não a beneficia —
    // quebra a nossa operação ou o produto dela. Este teste é o que impede a
    // lista de crescer no automático.
    for (const proibida of [
      "login", "cobranca", "avisoAtraso", "backup", "monitoramento",
      "statusPublico", "receitaAoFaturar", "baixaDePeca",
    ]) {
      expect(ehFuncao(proibida), proibida).toBe(false)
    }
  })
})

describe("ligada ou desligada", () => {
  it("sem nada gravado, TUDO está ligado", () => {
    // O comportamento de hoje, e o que garante que nenhuma empresa muda no dia
    // em que a chave passa a existir.
    for (const f of FUNCOES) {
      expect(funcaoLigada(f, []), f).toBe(true)
    }
  })

  it("desliga só o que está na lista", () => {
    expect(funcaoLigada("osPdf", ["osPdf"])).toBe(false)
    expect(funcaoLigada("osHistorico", ["osPdf"])).toBe(true)
  })

  it("chave desconhecida no banco não desliga nada", () => {
    // Valor antigo ou digitado errado não pode derrubar uma função que ninguém
    // pediu para desligar.
    expect(funcaoLigada("osPdf", ["lixo", "osPdfff"])).toBe(true)
  })
})

describe("o que vai para o banco", () => {
  it("guarda só o que o código conhece", () => {
    expect(desligadasValidas(["osPdf", "inventado", "nps"])).toEqual(["osPdf", "nps"])
  })

  it("não guarda repetido", () => {
    expect(desligadasValidas(["nps", "nps"])).toEqual(["nps"])
  })

  it("lista vazia continua vazia — e não vira 'tudo desligado'", () => {
    expect(desligadasValidas([])).toEqual([])
  })
})
