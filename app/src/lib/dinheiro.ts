// Ler e escrever DINHEIRO digitado, num lugar só.
//
// ─── O defeito que fez este arquivo existir ──────────────────────────────────
//
// Havia quatro cópias da mesma linha espalhadas pelas Actions:
//
//     Number(v.replace(/\./g, "").replace(",", "."))
//
// Ela trata todo PONTO como separador de milhar, o que está certo para o jeito
// brasileiro de escrever ("1.234,56") e errado para o jeito que a MÁQUINA
// escreve ("1234.56"). E o formulário preenchia os campos com o número cru do
// banco — que sai justamente com ponto decimal.
//
// Resultado: abrir a peça de R$ 12,50, não tocar em nada e salvar gravava
// R$ 125,00. Dez vezes mais, em silêncio. Com "0,75" era cem vezes.
//
// O estrago não parava no cadastro: `costPrice` alimenta o valor do estoque no
// balanço, o custo médio ao receber uma compra e o preço sugerido na OS. Um
// número inflado ali contamina a margem de todo serviço seguinte.
//
// ─── Por que UM módulo, e não quatro correções ───────────────────────────────
//
// Quatro cópias é como a quarta é esquecida. Duas delas eram de código escrito
// no mesmo dia — a prova de que copiar a linha é o caminho natural, e por isso
// a linha não pode mais existir solta.
//
// Módulo puro: conta de dinheiro precisa ser testável sem banco.

/**
 * Lê dinheiro digitado por gente OU escrito por máquina.
 *
 * Aceita "1.234,56" (brasileiro), "1234.56" (máquina), "12,50", "12.50",
 * "R$ 40,00" e "40". Devolve `null` para vazio e para o que não é número.
 *
 * ACEITA NEGATIVO: conta retificadora existe (ver lib/balanco.ts). Quem não
 * quiser negativo recusa depois — aqui é leitura, não regra de negócio.
 *
 * ─── Como o ponto é decidido ───────────────────────────────────────────────
 *
 * Com VÍRGULA presente, ela é o decimal e todo ponto é milhar. Sem vírgula, um
 * ponto só, com uma ou duas casas depois, é DECIMAL — porque "12.5" e "12.50"
 * não existem como milhar no português (milhar tem três casas: "1.234").
 * Qualquer outro arranjo de pontos é milhar.
 *
 * É essa regra que impede o "12.5" da tela virar 125.
 */
export function lerDinheiro(valor: unknown): number | null {
  const texto = String(valor ?? "")
    .replace(/\s| /g, "")
    .replace(/R\$/gi, "")
    .trim()
  if (!texto) return null

  const negativo = texto.startsWith("-")
  const corpo = texto.replace(/^[+-]/, "")
  if (!/^[\d.,]+$/.test(corpo)) return null

  const temVirgula = corpo.includes(",")
  const pontos = (corpo.match(/\./g) ?? []).length

  let normalizado: string
  if (temVirgula) {
    // Vírgula manda: ela é o decimal, ponto é milhar.
    normalizado = corpo.replace(/\./g, "").replace(",", ".")
    // Duas vírgulas não é número.
    if ((corpo.match(/,/g) ?? []).length > 1) return null
  } else if (pontos === 1) {
    const depois = corpo.split(".")[1] ?? ""
    // Uma ou duas casas depois do ponto = DECIMAL. Milhar tem três.
    normalizado = depois.length <= 2 ? corpo : corpo.replace(".", "")
  } else {
    normalizado = corpo.replace(/\./g, "")
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) return null
  return Math.round((negativo ? -n : n) * 100) / 100
}

/**
 * Escreve um número no formato que o CAMPO do formulário deve mostrar.
 *
 * Sempre em português ("12,50"), nunca com ponto decimal. É a outra metade do
 * conserto: com o campo saindo em vírgula, o leitor nunca mais precisa
 * adivinhar o que um ponto significa.
 *
 * `null`/`undefined` viram string vazia — campo em branco é "não informado", e
 * um "0" no lugar mentiria.
 */
export function paraCampo(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ""
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
