// Vocabulário adaptável: a empresa escolhe como chamar as coisas.
//
// Uma empresa de limpeza faz "visitas", uma de TI atende "chamados", uma
// consultoria toca "projetos" — e nenhuma delas fala "ordem de serviço". O
// sistema impunha o próprio vocabulário, e isso é o que faz o produto parecer
// "de outro ramo" para quem não é assistência técnica.
//
// Módulo puro de propósito: substituição em texto é o tipo de coisa que quebra
// em silêncio, e o português cobra concordância que o inglês não cobra.

export type Genero = "f" | "m"

export type Termo = {
  /** Forma curta, do jeito que a empresa escreveu: "OS", "Chamado", "Visita". */
  curto: string
  /** Por extenso, minúsculo: "ordem de serviço", "chamado". */
  singular: string
  /** Plural, minúsculo: "ordens de serviço", "chamados". */
  plural: string
  genero: Genero
}

export type Vocabulario = { os: Termo; tec: Termo }

// O que o sistema usa quando a empresa não configurou nada. É também a prova
// de que a substituição é sempre executada: se estes valores sumissem, os
// marcadores apareceriam crus na tela em vez de silenciosamente errados.
export const VOCABULARIO_PADRAO: Record<"pt" | "en", Vocabulario> = {
  pt: {
    os: { curto: "OS", singular: "ordem de serviço", plural: "ordens de serviço", genero: "f" },
    tec: { curto: "Técnico", singular: "técnico", plural: "técnicos", genero: "m" },
  },
  en: {
    os: { curto: "Order", singular: "service order", plural: "service orders", genero: "m" },
    tec: { curto: "Technician", singular: "technician", plural: "technicians", genero: "m" },
  },
}

// Sugestões prontas na tela de configuração. Não são um limite — a empresa
// pode escrever o que quiser — mas evitam que ela tenha que pensar em plural e
// gênero pra descobrir que o sistema serve pra ela.
export const SUGESTOES_OS: Termo[] = [
  { curto: "OS", singular: "ordem de serviço", plural: "ordens de serviço", genero: "f" },
  { curto: "Chamado", singular: "chamado", plural: "chamados", genero: "m" },
  { curto: "Atendimento", singular: "atendimento", plural: "atendimentos", genero: "m" },
  { curto: "Visita", singular: "visita", plural: "visitas", genero: "f" },
  { curto: "Serviço", singular: "serviço", plural: "serviços", genero: "m" },
  { curto: "Projeto", singular: "projeto", plural: "projetos", genero: "m" },
]

export const SUGESTOES_TEC: Termo[] = [
  { curto: "Técnico", singular: "técnico", plural: "técnicos", genero: "m" },
  { curto: "Profissional", singular: "profissional", plural: "profissionais", genero: "m" },
  { curto: "Colaborador", singular: "colaborador", plural: "colaboradores", genero: "m" },
  { curto: "Consultor", singular: "consultor", plural: "consultores", genero: "m" },
  { curto: "Equipe", singular: "equipe", plural: "equipes", genero: "f" },
]

// ─── Marcadores ───────────────────────────────────────────────────────────────
//
// Delimitador [[...]] em vez de {...} porque {...} é sintaxe do ICU: o
// next-intl exigiria que TODA chamada de tradução passasse os valores, em ~59
// pontos do código. Aqui a troca acontece uma vez, ao carregar as mensagens.
//
// Substituição CEGA no texto inteiro não serve: "os dados", "os Termos" são
// artigo, não a sigla — e a política de privacidade viraria outra coisa. Por
// isso o marcador é explícito, colocado à mão só onde é a entidade.

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function artigo(genero: Genero, plural: boolean): string {
  if (genero === "f") return plural ? "as" : "a"
  return plural ? "os" : "o"
}

/**
 * Monta a tabela de marcador → texto para um vocabulário.
 *
 * Para cada termo (os, tec):
 *   [[os]]      ordem de serviço    [[Os]]      Ordem de serviço
 *   [[osP]]     ordens de serviço   [[OsP]]     Ordens de serviço
 *   [[osC]]     OS                  (curto, na caixa que a empresa escreveu)
 *   [[osArt]]   a                   [[OsArt]]   A     (artigo, singular)
 *   [[osArtP]]  as                  [[OsArtP]]  As    (artigo, plural)
 *   [[osFim]]   a                   [[osFimP]]  as    (desinência de adjetivo)
 *
 * Os nomes carregam o prefixo do termo (osArt, tecArt) porque marcador solto
 * tipo [[ato]] é palavra de verdade em português e ficaria ilegível no meio do
 * arquivo de tradução.
 *
 * osFim tem o MESMO valor de osArt, mas nome próprio de propósito: quem edita
 * a tradução precisa enxergar que "concluíd[[osFim]]" é concordância de
 * adjetivo, não artigo. E há um limite real aqui — determinante irregular
 * ("nenhum/nenhuma", "um/uma") NÃO segue esse padrão: no masculino a
 * desinência é vazia, não "o". Frase com esses casos é escrita em construção
 * neutra ("Ainda não há [[osP]]"), nunca com marcador.
 */
export function tabelaDeTrocas(vocab: Vocabulario): Record<string, string> {
  const tabela: Record<string, string> = {}

  for (const [chave, termo] of Object.entries(vocab) as [keyof Vocabulario, Termo][]) {
    const Chave = capitalizar(chave)
    tabela[chave] = termo.singular
    tabela[Chave] = capitalizar(termo.singular)
    tabela[`${chave}P`] = termo.plural
    tabela[`${Chave}P`] = capitalizar(termo.plural)
    tabela[`${chave}C`] = termo.curto
    tabela[`${chave}Art`] = artigo(termo.genero, false)
    tabela[`${Chave}Art`] = capitalizar(artigo(termo.genero, false))
    tabela[`${chave}ArtP`] = artigo(termo.genero, true)
    tabela[`${Chave}ArtP`] = capitalizar(artigo(termo.genero, true))
    tabela[`${chave}Fim`] = artigo(termo.genero, false)
    tabela[`${chave}FimP`] = artigo(termo.genero, true)
  }

  return tabela
}

const MARCADOR = /\[\[([A-Za-z]+)\]\]/g

/** Troca os marcadores de um texto. Marcador desconhecido some, em vez de vazar. */
export function aplicarEmTexto(texto: string, tabela: Record<string, string>): string {
  if (!texto.includes("[[")) return texto
  return texto.replace(MARCADOR, (inteiro, chave: string) => {
    const valor = tabela[chave]
    // Marcador que ninguém definiu é erro de digitação nossa. Deixar cru
    // ("[[osx]]") na tela do cliente é pior que qualquer coisa — mas apagar
    // silenciosamente esconderia o defeito, então devolve o inteiro e o teste
    // de cobertura abaixo é quem pega.
    return valor ?? inteiro
  })
}

/**
 * Percorre a árvore de mensagens trocando os marcadores.
 *
 * Roda uma vez por combinação de idioma + vocabulário (ver o cache em
 * i18n/request.ts), não a cada tradução.
 */
export function aplicarNasMensagens<T>(mensagens: T, tabela: Record<string, string>): T {
  if (typeof mensagens === "string") {
    return aplicarEmTexto(mensagens, tabela) as T
  }
  if (Array.isArray(mensagens)) {
    return mensagens.map((m) => aplicarNasMensagens(m, tabela)) as T
  }
  if (mensagens && typeof mensagens === "object") {
    const saida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(mensagens)) {
      saida[k] = aplicarNasMensagens(v, tabela)
    }
    return saida as T
  }
  return mensagens
}

// ─── Leitura do que está gravado ──────────────────────────────────────────────

function termoValido(v: unknown): v is Termo {
  if (!v || typeof v !== "object") return false
  const t = v as Record<string, unknown>
  return (
    typeof t.curto === "string" && t.curto.trim() !== "" &&
    typeof t.singular === "string" && t.singular.trim() !== "" &&
    typeof t.plural === "string" && t.plural.trim() !== "" &&
    (t.genero === "f" || t.genero === "m")
  )
}

/**
 * Lê o Json gravado no Tenant, caindo no padrão em qualquer coisa estranha.
 *
 * Isto roda no caminho de TODA página: um Json malformado não pode derrubar o
 * sistema inteiro — no pior caso a empresa vê o vocabulário padrão.
 */
export function lerVocabulario(gravado: unknown, idioma: "pt" | "en"): Vocabulario {
  const padrao = VOCABULARIO_PADRAO[idioma]
  if (!gravado || typeof gravado !== "object" || Array.isArray(gravado)) return padrao

  const bruto = gravado as Record<string, unknown>
  return {
    os: termoValido(bruto.os) ? bruto.os : padrao.os,
    tec: termoValido(bruto.tec) ? bruto.tec : padrao.tec,
  }
}

export const MAX_TAMANHO_TERMO = 30

/** Valida o que a empresa digitou na tela de configuração. */
export function validarTermo(entrada: {
  curto: string
  singular: string
  plural: string
  genero: string
}): string | null {
  const campos = [entrada.curto, entrada.singular, entrada.plural].map((c) => c.trim())
  if (campos.some((c) => c.length < 2)) return "termoCurto"
  if (campos.some((c) => c.length > MAX_TAMANHO_TERMO)) return "termoLongo"
  if (entrada.genero !== "f" && entrada.genero !== "m") return "generoInvalido"
  return null
}

export function normalizarTermo(entrada: {
  curto: string
  singular: string
  plural: string
  genero: string
}): Termo {
  return {
    curto: entrada.curto.trim(),
    // Singular e plural entram minúsculos porque aparecem no meio de frase
    // ("Nenhuma ordem de serviço encontrada"). O marcador [[Os]] devolve a
    // versão capitalizada quando é começo de frase ou título.
    singular: entrada.singular.trim().toLocaleLowerCase("pt-BR"),
    plural: entrada.plural.trim().toLocaleLowerCase("pt-BR"),
    genero: entrada.genero as Genero,
  }
}
