// De "o João" para um id — sem chutar.
//
// A assistente recebe fala, e fala não traz id. "Conclui a do João" precisa
// virar um clientId antes de qualquer coisa acontecer, e é aqui que essa
// tradução mora.
//
// ─── A regra que este módulo existe para garantir ────────────────────────────
//
// Na dúvida, NÃO ESCOLHE.
//
// Se há dois Joões, ou duas ordens abertas do mesmo João, a resposta certa é
// devolver as opções para a assistente perguntar — nunca pegar a primeira. Um
// sistema que escolhe sozinho acerta na maioria das vezes e, na minoria,
// conclui a OS errada, apaga o cliente errado, emite nota do serviço errado.
// Essas são exatamente as operações que não têm desfazer.
//
// Por isso é módulo puro e testado: é a regra de maior consequência da
// assistente inteira, e ela não pode depender de o modelo "ter sido cuidadoso".

/** O que se achou ao procurar um registro pelo que a pessoa falou. */
export type Resolucao<T> =
  | { tipo: "um"; item: T }
  | { tipo: "nenhum" }
  /** Ambíguo. Quem chamou tem de PERGUNTAR, não escolher. */
  | { tipo: "varios"; opcoes: T[] }

/** Sem acento, sem caixa, sem espaço sobrando. Quem fala "jose" tem de achar
 *  "José", e quem fala "JOÃO  SILVA" tem de achar "João Silva". */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Escolhe UM candidato a partir do que a pessoa falou.
 *
 * A preferência por correspondência EXATA não é detalhe: com "João Silva" e
 * "João Silva Júnior" cadastrados, procurar "João Silva" por semelhança acha os
 * dois e cairia em ambiguidade toda vez — e a pessoa que digitou o nome inteiro
 * e certo seria obrigada a desambiguar o que já estava sem ambiguidade.
 *
 * Havendo exato, ele vence. Não havendo, vale o parcial — e mais de um parcial
 * é ambíguo, não é "o primeiro".
 */
export function resolverUnico<T>(
  falado: string,
  candidatos: readonly T[],
  comoTexto: (item: T) => string
): Resolucao<T> {
  const alvo = normalizar(falado)
  if (!alvo) return { tipo: "nenhum" }

  const exatos = candidatos.filter((c) => normalizar(comoTexto(c)) === alvo)
  if (exatos.length === 1) return { tipo: "um", item: exatos[0] }
  // Dois cadastros com o MESMO nome escrito igual é ambiguidade de verdade:
  // nem a pessoa nem o sistema têm como saber qual, e chutar é o pior caminho.
  if (exatos.length > 1) return { tipo: "varios", opcoes: exatos }

  const parciais = candidatos.filter((c) => {
    const t = normalizar(comoTexto(c))
    return t.includes(alvo) || alvo.includes(t)
  })
  if (parciais.length === 0) return { tipo: "nenhum" }
  if (parciais.length === 1) return { tipo: "um", item: parciais[0] }
  return { tipo: "varios", opcoes: parciais }
}

/**
 * O número de uma OS, do jeito que sai da fala.
 *
 * O reconhecimento devolve "vinte e quatro" como "24", mas também devolve
 * "OS 24", "número 24", "#24" e "0024". Todos são o mesmo pedido.
 *
 * Devolve `null` quando não há dígito nenhum — melhor não achar do que casar
 * com uma ordem qualquer.
 */
export function numeroFalado(falado: string): string | null {
  const digitos = falado.replace(/\D/g, "")
  if (!digitos) return null
  // Zeros à esquerda somem: "0024" e "24" são a mesma OS, e o número é gravado
  // sem preenchimento.
  const limpo = digitos.replace(/^0+/, "")
  return limpo === "" ? "0" : limpo
}

/** Duas referências a número de OS apontam para a mesma? */
export function mesmoNumero(a: string, b: string): boolean {
  const na = numeroFalado(a)
  const nb = numeroFalado(b)
  return na !== null && na === nb
}

/**
 * O texto que a assistente recebe quando não deu para escolher.
 *
 * Escrito para o MODELO ler e transformar em pergunta. Traz as opções, para a
 * assistente conseguir perguntar "o João Silva ou o João Souza?" em vez do
 * inútil "não consegui identificar".
 */
export function comoPerguntar(oQue: string, opcoes: readonly string[]): string {
  const lista = opcoes.slice(0, 8).join("; ")
  const eMais = opcoes.length > 8 ? ` (e mais ${opcoes.length - 8})` : ""
  return (
    `Há mais de um ${oQue} possível: ${lista}${eMais}. ` +
    `PERGUNTE à pessoa qual delas antes de tentar de novo. Não escolha sozinho.`
  )
}
