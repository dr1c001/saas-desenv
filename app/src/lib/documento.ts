// CPF e CNPJ: validar, comparar e formatar.
//
// ─── Por que validar, se o campo e opcional ──────────────────────────────────
//
// Porque o documento errado nao para no cadastro. Ele sai no boleto, na nota do
// fornecedor e na conciliacao — e o erro so aparece semanas depois, quando o
// contador devolve. Um digito trocado passa despercebido a olho nu; o digito
// verificador existe exatamente para isso.
//
// O campo continua OPCIONAL: fornecedor sem documento e cadastro legitimo (o
// vendedor da esquina, a loja que ainda nao mandou os dados). O que nao pode e
// documento PREENCHIDO e invalido, que e pior que documento em branco — parece
// certo.
//
// Modulo puro.

/** So os digitos. E a forma comparavel do documento. */
export function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "")
}

/**
 * Dois documentos sao o mesmo?
 *
 * Compara pelos DIGITOS, e nao pelo texto: "12.345.678/0001-99" e
 * "12345678000199" sao o mesmo CNPJ cadastrado de dois jeitos, e sem isto o
 * sistema deixaria o mesmo fornecedor entrar duas vezes — o que depois divide o
 * historico de compras dele em duas fichas.
 */
export function mesmoDocumento(a: unknown, b: unknown): boolean {
  const x = somenteDigitos(a)
  const y = somenteDigitos(b)
  return x.length > 0 && x === y
}

/**
 * O digito verificador do modulo 11, que CPF e CNPJ usam.
 *
 * `pesos` multiplica cada digito da esquerda para a direita.
 */
function digitoModulo11(digitos: string, pesos: readonly number[]): number {
  const soma = pesos.reduce((s, peso, i) => s + Number(digitos[i]) * peso, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/**
 * CPF valido?
 *
 * Recusa os de digito repetido (111.111.111-11, 000.000.000-00 e os outros
 * nove). Eles passam no calculo do modulo 11 — e e o defeito classico de quem
 * implementa a conta e para por ali: 11111111111 vira um CPF "valido" e entra
 * no cadastro.
 */
export function cpfValido(valor: unknown): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  const primeiro = digitoModulo11(d, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = digitoModulo11(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return Number(d[9]) === primeiro && Number(d[10]) === segundo
}

/** CNPJ valido? Mesma armadilha do digito repetido, mesma recusa. */
export function cnpjValido(valor: unknown): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const primeiro = digitoModulo11(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = digitoModulo11(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return Number(d[12]) === primeiro && Number(d[13]) === segundo
}

/**
 * Documento aceitavel para gravar.
 *
 * VAZIO PASSA, e isso e o ponto: o campo e opcional, e recusar o vazio
 * transformaria "ainda nao tenho os dados" em "nao posso cadastrar". O que se
 * recusa e o documento preenchido que nao fecha — e o parcial, que quase sempre
 * e alguem que parou de digitar no meio.
 */
export function documentoAceitavel(valor: unknown): boolean {
  const d = somenteDigitos(valor)
  if (d.length === 0) return true
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

/** Como o documento aparece na tela. Tamanho errado sai como veio. */
export function formatarDocumento(valor: unknown): string {
  const d = somenteDigitos(valor)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  return String(valor ?? "")
}
