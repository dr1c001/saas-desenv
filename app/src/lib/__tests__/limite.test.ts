import { describe, expect, it } from "vitest"
import {
  ajusteEscolhido,
  limiteEfetivo,
  modoDoLimite,
  resumoDoLimite,
  type Ajuste,
} from "@/lib/limite"

// A distinção que estes testes protegem: "herdar do plano" e "sem limite" são
// coisas diferentes, e as duas seriam `null` num campo de número anulável.
// Confundir custa dos dois lados — a empresa marcada como ilimitada que na
// verdade só herdava é barrada no dia em que o plano aperta; a marcada como
// herdando que era ilimitada perde o combinado sem ninguém tocar na conta dela.

describe("o teto que vale", () => {
  it("sem ajuste, vale o do plano", () => {
    expect(limiteEfetivo(3, null)).toBe(3)
    expect(limiteEfetivo(50, null)).toBe(50)
  })

  it("sem ajuste num plano ilimitado, continua ilimitado", () => {
    expect(limiteEfetivo(null, null)).toBeNull()
  })

  it("zero é SEM LIMITE, não zero", () => {
    // Zero usuário, zero OS ou zero nota não significa nada como teto real,
    // então o valor está livre para carregar esse sentido.
    expect(limiteEfetivo(3, 0)).toBeNull()
    expect(limiteEfetivo(50, 0)).toBeNull()
  })

  it("um número próprio manda mais que o plano, para cima e para baixo", () => {
    // O caso concreto: a empresa que precisa de 12 usuários mas não quer o
    // Enterprise. E o inverso, que também precisa funcionar.
    expect(limiteEfetivo(3, 12)).toBe(12)
    expect(limiteEfetivo(200, 40)).toBe(40)
  })

  it("valor corrompido no banco herda, em vez de parar a empresa", () => {
    // Barrar tudo por causa de um -1 seria parar a empresa inteira por um erro
    // de digitação.
    expect(limiteEfetivo(3, -1)).toBe(3)
    expect(limiteEfetivo(3, 2.5)).toBe(3)
  })
})

describe("em que modo a tela abre", () => {
  it("distingue os três estados", () => {
    expect(modoDoLimite(null)).toBe("herdar")
    expect(modoDoLimite(0)).toBe("semLimite")
    expect(modoDoLimite(12)).toBe("proprio")
  })
})

describe("o que a tela grava", () => {
  it("cada modo grava a sua marca", () => {
    expect(ajusteEscolhido("herdar", 12)).toBeNull()
    expect(ajusteEscolhido("semLimite", null)).toBe(0)
    expect(ajusteEscolhido("proprio", 12)).toBe(12)
  })

  it("'próprio' sem número NÃO vira sem limite", () => {
    // Salvar um campo em branco como zero daria de graça o oposto do que a
    // pessoa estava tentando fazer: em vez de um teto próprio, nenhum teto.
    expect(ajusteEscolhido("proprio", null)).toBeNull()
    expect(ajusteEscolhido("proprio", 0)).toBeNull()
    expect(ajusteEscolhido("proprio", -5)).toBeNull()
    expect(ajusteEscolhido("proprio", 1.5)).toBeNull()
  })

  it("ida e volta pela tela não muda o que estava gravado", () => {
    // Abrir a tela e salvar sem mexer não pode alterar a conta de ninguém.
    for (const gravado of [null, 0, 1, 12, 999] as Ajuste[]) {
      const modo = modoDoLimite(gravado)
      expect(ajusteEscolhido(modo, gravado), `gravado=${gravado}`).toEqual(gravado)
    }
  })
})

describe("o resumo da listagem", () => {
  it("marca com asterisco só o que foi ajustado à mão", () => {
    // Quem olha a lista precisa distinguir de relance a empresa que tem
    // combinado próprio daquela que segue o plano.
    expect(resumoDoLimite(3, null)).toBe("3")
    expect(resumoDoLimite(3, 12)).toBe("12*")
    expect(resumoDoLimite(3, 0)).toBe("∞*")
    expect(resumoDoLimite(null, null)).toBe("∞")
  })
})
