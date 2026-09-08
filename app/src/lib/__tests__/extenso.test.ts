import { describe, expect, it } from "vitest"
import { numeroEExtenso, porExtenso } from "@/lib/extenso"
import { PAST_DUE_GRACE_DAYS } from "@/lib/past-due"

// Isto entra num CONTRATO assinado. O extenso é o que vale juridicamente se o
// algarismo for adulterado, então errar aqui não é erro de texto: é cláusula
// com prazo errado.

describe("números por extenso", () => {
  it("os que aparecem em prazo de contrato", () => {
    expect(porExtenso(0)).toBe("zero")
    expect(porExtenso(1)).toBe("um")
    expect(porExtenso(5)).toBe("cinco")
    expect(porExtenso(7)).toBe("sete")
    expect(porExtenso(15)).toBe("quinze")
    expect(porExtenso(30)).toBe("trinta")
    expect(porExtenso(60)).toBe("sessenta")
    expect(porExtenso(90)).toBe("noventa")
    expect(porExtenso(180)).toBe("cento e oitenta")
    expect(porExtenso(365)).toBe("trezentos e sessenta e cinco")
  })

  it("a faixa dos dez aos dezenove, que não segue a regra das dezenas", () => {
    expect(porExtenso(10)).toBe("dez")
    expect(porExtenso(11)).toBe("onze")
    expect(porExtenso(14)).toBe("catorze")
    expect(porExtenso(16)).toBe("dezesseis")
    expect(porExtenso(19)).toBe("dezenove")
  })

  it("cem é exato; acima vira 'cento e'", () => {
    expect(porExtenso(100)).toBe("cem")
    expect(porExtenso(101)).toBe("cento e um")
    expect(porExtenso(110)).toBe("cento e dez")
  })

  it("dezena redonda não ganha 'e' sobrando", () => {
    expect(porExtenso(20)).toBe("vinte")
    expect(porExtenso(40)).toBe("quarenta")
    expect(porExtenso(200)).toBe("duzentos")
  })

  it("varre 0 a 999 sem produzir texto quebrado", () => {
    for (let n = 0; n <= 999; n++) {
      const s = porExtenso(n)
      expect(s, `n=${n}`).not.toMatch(/^\s|\s$/)
      expect(s, `n=${n}`).not.toMatch(/\s\se|e\s\s/)
      // Conectivo "e" solto no fim — e não qualquer palavra terminada em
      // "e", que pegaria "sete", "onze", "quinze".
      expect(s, `n=${n}`).not.toMatch(/\se\s*$/)
      expect(s.length, `n=${n}`).toBeGreaterThan(0)
    }
  })

  it("fora da faixa devolve o algarismo, e não um extenso inventado", () => {
    // Contrato com número errado por extenso é pior que contrato sem extenso.
    expect(porExtenso(1000)).toBe("1000")
    expect(porExtenso(-5)).toBe("-5")
    expect(porExtenso(1.5)).toBe("1.5")
  })
})

describe("a forma que a cláusula usa", () => {
  it("junta algarismo e extenso", () => {
    expect(numeroEExtenso(30)).toBe("30 (trinta)")
    expect(numeroEExtenso(5)).toBe("5 (cinco)")
  })

  it("a carência VIGENTE sai por extenso de verdade", () => {
    // O defeito real: o contrato tinha um caso especial que só sabia dizer
    // "cinco". Quando a carência virou 30, ele passou a imprimir "30 (30)".
    // Este teste segue o valor de verdade, então quebra de novo se alguém
    // mudar a carência para fora da faixa coberta.
    const texto = numeroEExtenso(PAST_DUE_GRACE_DAYS)
    expect(texto).toContain(String(PAST_DUE_GRACE_DAYS))
    expect(texto).not.toBe(`${PAST_DUE_GRACE_DAYS} (${PAST_DUE_GRACE_DAYS})`)
    expect(texto).toMatch(/^\d+ \([a-zçãé ]+\)$/)
  })
})
