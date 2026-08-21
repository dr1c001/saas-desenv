// As mensagens com o vocabulário da empresa já aplicado.
//
// Ponto ÚNICO. Antes existiam dois caminhos para traduzir, e só um trocava os
// marcadores:
//
//   getTranslations()/useTranslations()  → i18n/request.ts → trocava ✓
//   getTranslator(locale, ns)            → lib/i18n.ts     → NÃO trocava ✗
//
// O segundo é justamente o que gera e-mail, WhatsApp e PDF — as coisas que
// saem do sistema e chegam ao CLIENTE FINAL da empresa. Onze textos com
// marcador passavam por ali, então o cliente da nossa cliente recebia
// "[[osC]] #1234" no e-mail e no recibo. (Achado em auditoria, 20/08/2026.)
//
// O padrão agora é trocar SEMPRE. Vocabulário customizado é opt-in de quem tem
// o tenant em mãos; quem não passa nada recebe o texto padrão correto, nunca o
// marcador cru. Errar para "texto padrão" é invisível; errar para "marcador
// cru" é constrangedor na frente do cliente de outra empresa.

import ptMessages from "../../messages/pt.json"
import enMessages from "../../messages/en.json"
import {
  aplicarNasMensagens,
  lerVocabulario,
  tabelaDeTrocas,
  VOCABULARIO_PADRAO,
} from "@/lib/vocabulario"

export type Idioma = "pt" | "en"

const ORIGINAIS: Record<Idioma, unknown> = { pt: ptMessages, en: enMessages }

// Trocar os marcadores percorre ~1400 textos. É barato, mas rodaria em TODA
// requisição — e o resultado só muda quando a empresa altera o vocabulário.
// A chave inclui o vocabulário inteiro, então mudar a configuração invalida
// sozinho, sem precisar limpar nada.
const cache = new Map<string, unknown>()

/** Teto pra não crescer sem limite num servidor com muitos tenants: o padrão
 *  (a maioria das empresas) fica sempre, os customizados rodam. */
function podar(locale: Idioma) {
  if (cache.size <= 50) return
  for (const k of cache.keys()) {
    if (!k.endsWith(JSON.stringify(VOCABULARIO_PADRAO[locale]))) {
      cache.delete(k)
      return
    }
  }
}

/**
 * As mensagens do idioma com os marcadores já resolvidos.
 *
 * Síncrona de propósito: `getTranslator` é chamado de dentro de componentes de
 * PDF e de montagem de e-mail, que não são assíncronos. Os dois arquivos de
 * mensagem já entram no pacote do servidor de qualquer forma.
 */
export function mensagensComVocabulario(locale: Idioma, vocabularioGravado: unknown): unknown {
  const vocabulario = lerVocabulario(vocabularioGravado, locale)
  const chave = `${locale}:${JSON.stringify(vocabulario)}`

  const emCache = cache.get(chave)
  if (emCache) return emCache

  const aplicadas = aplicarNasMensagens(ORIGINAIS[locale], tabelaDeTrocas(vocabulario))
  podar(locale)
  cache.set(chave, aplicadas)
  return aplicadas
}
