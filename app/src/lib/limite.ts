// Teto ajustado por empresa, por cima do que o plano dá.
//
// O que isto resolve: os planos são três, e as empresas não. Sempre aparece a
// que precisa de 12 usuários mas não quer o Enterprise, ou a que quer 30 notas
// por mês em vez de 8. Hoje a única saída seria mudar o plano dela — o que
// muda o preço e todo o resto junto.
//
// ─── O detalhe que define o desenho ──────────────────────────────────────────
//
// "Herdar do plano" e "sem limite" são coisas DIFERENTES, e as duas seriam
// `null` se o ajuste fosse só um número anulável:
//
//   herdar    → o teto é o que o plano disser, hoje e quando o plano mudar
//   sem limite → o teto não existe para esta empresa, independente do plano
//
// Confundir os dois é caro nos dois sentidos. Uma empresa marcada como "sem
// limite" que na verdade só herdava passa a ser barrada no dia em que alguém
// aperta o plano. Uma marcada como "herdar" que na verdade era ilimitada perde
// o combinado sem ninguém tocar na conta dela.
//
// Por isso `0` é o "sem limite" — zero usuário, zero OS ou zero nota não
// significa nada como teto real, então o valor está livre para carregar esse
// sentido, e a tela oferece as três opções em vez de um campo de número solto.

/** `null` = herda do plano · `0` = sem limite · outro = o teto desta empresa. */
export type Ajuste = number | null

/** Como a tela apresenta as três possibilidades. */
export type ModoDoLimite = "herdar" | "semLimite" | "proprio"

/**
 * O teto que vale de verdade.
 *
 * Devolve `null` para "sem limite", que é como o resto do sistema já
 * representa isso (`maxUsuarios: null` no Enterprise) — assim quem consome não
 * precisa saber que existe ajuste por empresa.
 */
export function limiteEfetivo(doPlano: number | null, ajuste: Ajuste): number | null {
  if (ajuste === null || ajuste === undefined) return doPlano
  if (ajuste === 0) return null
  // Negativo é dado corrompido, não "menos que zero": herda, que é o
  // comportamento sem surpresa. Barrar tudo por causa de um -1 no banco seria
  // parar a empresa inteira por um erro de digitação.
  if (!Number.isInteger(ajuste) || ajuste < 0) return doPlano
  return ajuste
}

/** Em que modo a tela deve abrir, dado o que está gravado. */
export function modoDoLimite(ajuste: Ajuste): ModoDoLimite {
  if (ajuste === null || ajuste === undefined) return "herdar"
  if (ajuste === 0) return "semLimite"
  return "proprio"
}

/** O que gravar, dado o que a pessoa escolheu na tela. */
export function ajusteEscolhido(modo: ModoDoLimite, numero: number | null): Ajuste {
  if (modo === "herdar") return null
  if (modo === "semLimite") return 0
  // "Próprio" sem número válido não vira zero — zero é SEM LIMITE, e salvar um
  // campo em branco como "ilimitado" daria de graça o oposto do que a pessoa
  // estava tentando fazer.
  if (numero === null || !Number.isInteger(numero) || numero < 1) return null
  return numero
}

/** O texto curto que resume o teto na listagem do painel. */
export function resumoDoLimite(doPlano: number | null, ajuste: Ajuste): string {
  const efetivo = limiteEfetivo(doPlano, ajuste)
  const valor = efetivo === null ? "∞" : String(efetivo)
  return modoDoLimite(ajuste) === "herdar" ? valor : `${valor}*`
}
