// Número por extenso, em português.
//
// Existe por causa do contrato. Documento jurídico brasileiro escreve prazo em
// algarismo E por extenso — "30 (trinta) dias" — porque o extenso é o que vale
// se o algarismo for adulterado. O contrato fazia isso com um caso especial:
//
//     {dias} ({dias === 5 ? "cinco" : String(dias)}) dias corridos
//
// Ou seja: sabia falar UM número. No dia em que a carência deixou de ser 5, o
// contrato passou a sair "30 (30) dias corridos" — o algarismo repetido no
// lugar do extenso, num documento que vai assinado para o cliente.
//
// Cobre 0–999, que é a faixa de prazo de qualquer cláusula deste contrato
// (carência, validade, aviso prévio). Acima disso devolve o algarismo, em vez
// de inventar: um contrato com o número errado por extenso é pior que um
// contrato sem extenso.

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro",
  "cinco", "seis", "sete", "oito", "nove",
]

const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "catorze",
  "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]

const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta",
  "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
]

const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos",
  "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos",
]

/**
 * O número escrito por extenso.
 *
 * Fora da faixa coberta, devolve o algarismo: melhor repetir o número do que
 * escrever um extenso errado num documento assinado.
 */
export function porExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
  if (n < 10) return UNIDADES[n]
  if (n < 20) return DEZ_A_DEZENOVE[n - 10]

  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`
  }

  // "cem" é exato; qualquer coisa acima vira "cento e ...".
  if (n === 100) return "cem"

  const c = Math.floor(n / 100)
  const resto = n % 100
  return resto === 0 ? CENTENAS[c] : `${CENTENAS[c]} e ${porExtenso(resto)}`
}

/** A forma que a cláusula usa: algarismo e extenso juntos. */
export function numeroEExtenso(n: number): string {
  return `${n} (${porExtenso(n)})`
}
