// Campos personalizados: validação e leitura dos valores.
//
// Módulo puro. As definições vêm do banco (CustomField), os valores vêm de um
// Json solto no registro — e Json solto é justamente o que precisa de guarda
// antes de virar tela ou PDF.

export type TipoCampo = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX"

export type DefinicaoCampo = {
  id: string
  label: string
  type: TipoCampo
  options: string[]
  required: boolean
}

export const TIPOS_CAMPO: TipoCampo[] = ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"]

export const MAX_CAMPOS_POR_ENTIDADE = 20
export const MAX_TAMANHO_VALOR = 500

// Nome do input no formulário. Prefixo evita colidir com campo nativo: uma
// empresa que criar um campo chamado "email" não pode sobrescrever o e-mail
// do cliente ao enviar o form.
export const PREFIXO_CAMPO = "cf_"

export function nomeDoInput(fieldId: string): string {
  return `${PREFIXO_CAMPO}${fieldId}`
}

export type ErroCampo = { fieldId: string; label: string; motivo: string }

/**
 * Lê os valores enviados pelo formulário e devolve o Json a gravar.
 *
 * Aceita apenas os campos que existem nas definições — um valor que chegue com
 * id inventado é descartado em silêncio, porque a única forma de ele aparecer é
 * alguém montando a requisição na mão (Server Action é endpoint HTTP como
 * qualquer outro).
 */
export function lerValoresDoFormulario(
  definicoes: DefinicaoCampo[],
  ler: (nome: string) => string | null
): { valores: Record<string, string>; erros: ErroCampo[] } {
  const valores: Record<string, string> = {}
  const erros: ErroCampo[] = []

  for (const campo of definicoes) {
    const bruto = (ler(nomeDoInput(campo.id)) ?? "").trim()

    if (!bruto) {
      if (campo.required) {
        erros.push({ fieldId: campo.id, label: campo.label, motivo: "obrigatorio" })
      }
      // Vazio não entra no Json: evita acumular chave com string vazia em
      // todo registro, e a leitura já trata ausência como "não preenchido".
      continue
    }

    if (bruto.length > MAX_TAMANHO_VALOR) {
      erros.push({ fieldId: campo.id, label: campo.label, motivo: "muitoLongo" })
      continue
    }

    switch (campo.type) {
      case "NUMBER": {
        // Aceita vírgula decimal: é como o brasileiro digita, e recusar
        // "1,5" num campo chamado "metragem" seria incompreensível.
        const normalizado = bruto.replace(",", ".")
        if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
          erros.push({ fieldId: campo.id, label: campo.label, motivo: "numeroInvalido" })
          continue
        }
        valores[campo.id] = normalizado
        break
      }
      case "DATE": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto) || Number.isNaN(Date.parse(bruto))) {
          erros.push({ fieldId: campo.id, label: campo.label, motivo: "dataInvalida" })
          continue
        }
        valores[campo.id] = bruto
        break
      }
      case "SELECT": {
        // Valor fora da lista só chega por requisição montada à mão, mas se
        // passasse ficaria gravado pra sempre num campo que a tela apresenta
        // como fechado.
        if (!campo.options.includes(bruto)) {
          erros.push({ fieldId: campo.id, label: campo.label, motivo: "opcaoInvalida" })
          continue
        }
        valores[campo.id] = bruto
        break
      }
      case "CHECKBOX": {
        valores[campo.id] = bruto === "on" || bruto === "true" ? "true" : "false"
        break
      }
      default:
        valores[campo.id] = bruto
    }
  }

  return { valores, erros }
}

/**
 * Junta definições com valores gravados, pra exibição.
 *
 * Campo apagado depois de preenchido some daqui sozinho: percorre as
 * DEFINIÇÕES, não as chaves do Json. É o que permite guardar valor em Json sem
 * deixar dado órfão aparecendo na tela.
 */
export function paraExibicao(
  definicoes: DefinicaoCampo[],
  valores: unknown
): { label: string; valor: string; type: TipoCampo }[] {
  const mapa = valorComoMapa(valores)
  return definicoes
    .map((campo) => ({ label: campo.label, valor: mapa[campo.id] ?? "", type: campo.type }))
    .filter((c) => c.valor !== "")
}

/** Devolve o valor de um campo pra preencher o formulário de edição. */
export function valorAtual(valores: unknown, fieldId: string): string {
  return valorComoMapa(valores)[fieldId] ?? ""
}

// O Json vem do banco tipado como unknown/JsonValue. Pode ser null, array ou
// número se alguém gravou errado por fora — nesses casos vale tratar como
// vazio em vez de estourar na renderização da tela do cliente.
function valorComoMapa(valores: unknown): Record<string, string> {
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) return {}
  const saida: Record<string, string> = {}
  for (const [k, v] of Object.entries(valores as Record<string, unknown>)) {
    if (typeof v === "string") saida[k] = v
    else if (typeof v === "number" || typeof v === "boolean") saida[k] = String(v)
  }
  return saida
}

/** Valida a definição de um campo, no momento em que a empresa o cria. */
export function validarDefinicao(entrada: {
  label: string
  type: string
  options: string[]
}): string | null {
  const label = entrada.label.trim()
  if (label.length < 2) return "labelCurto"
  if (label.length > 40) return "labelLongo"
  if (!TIPOS_CAMPO.includes(entrada.type as TipoCampo)) return "tipoInvalido"
  // Lista fechada sem opção nenhuma vira um campo que não dá pra preencher.
  if (entrada.type === "SELECT" && entrada.options.length === 0) return "semOpcoes"
  return null
}

/** Quebra o texto de opções digitado pela empresa (uma por linha). */
export function lerOpcoes(texto: string): string[] {
  const limpas = texto.split("\n").map((o) => o.trim()).filter((o) => o !== "")
  return [...new Set(limpas)].slice(0, 50)
}
