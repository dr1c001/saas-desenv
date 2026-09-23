// A VERSÃO dos documentos legais, para o aceite saber o que foi aceito.
//
// Os Termos dizem, na seção 14, que "podemos atualizar estes Termos" e que "o
// uso continuado após a alteração implica concordância com os novos termos".
// Repare no que isso exige e no que NÃO exige: não exige um fluxo de re-aceite
// — o uso continuado é o aceite. Exige saber QUAL VERSÃO cada conta aceitou,
// para conseguir dizer "isto mudou em relação ao que você aceitou". Sem versão
// gravada, essa frase não tem como ser honrada.
//
// ─── Por que um módulo próprio ───────────────────────────────────────────────
//
// `VERSAO_CONTRATO` mora em components/pdf/contrato-pdf.tsx, e importar de lá
// arrastaria o @react-pdf/renderer para dentro de uma Server Action de
// autenticação. E as datas de hoje vivem escritas à mão dentro do texto, em
// `legal.terms.lastUpdated` e `legal.privacy.lastUpdated`, nos dois idiomas —
// quatro lugares, nenhum deles legível por código.
//
// ATENÇÃO AO MEXER NOS TERMOS OU NA PRIVACIDADE: mudar o texto obriga a subir a
// constante correspondente aqui. Há teste que lê as duas fontes e quebra quando
// elas discordam (lib/__tests__/aceite-dos-termos.test.ts) — é ele que impede o
// aceite de registrar uma versão que já não é a publicada.
// (Achado na auditoria de 13/09/2026, grupo 9.)

/** A data de `legal.terms.lastUpdated`, em ISO. */
export const VERSAO_TERMOS = "2026-09-08"

/** A data de `legal.privacy.lastUpdated`, em ISO. */
export const VERSAO_PRIVACIDADE = "2026-07-20"

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]
const MESES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]

/**
 * A data ISO escondida num "Última atualização: 8 de setembro de 2026" ou num
 * "Last updated: 8 September 2026" / "Last updated: July 20, 2026".
 *
 * Existe para o TESTE poder comparar o texto publicado com a constante acima.
 * Os dois idiomas escrevem a data de formas diferentes entre si — e a
 * privacidade em inglês usa mês-dia-ano enquanto os termos usam dia-mês-ano —,
 * então uma regra só não serve.
 */
export function dataPublicada(texto: string): string | null {
  const limpo = texto.toLowerCase()
  const ano = limpo.match(/\b(20\d{2})\b/)
  if (!ano) return null

  const mes = [...MESES_PT, ...MESES_EN].findIndex((m) => limpo.includes(m))
  if (mes < 0) return null
  const numeroDoMes = (mes % 12) + 1

  // O dia é o número de 1 a 31 que não é o ano.
  const dia = [...limpo.matchAll(/\b(\d{1,2})\b/g)]
    .map((m) => Number(m[1]))
    .find((n) => n >= 1 && n <= 31)
  if (dia === undefined) return null

  const pad = (n: number) => String(n).padStart(2, "0")
  return `${ano[1]}-${pad(numeroDoMes)}-${pad(dia)}`
}
