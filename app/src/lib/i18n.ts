import { createTranslator } from "next-intl"
import ptMessages from "../../messages/pt.json"
import { mensagensComVocabulario } from "@/lib/mensagens"

// E-mails (lib/resend.ts) e PDFs (components/pdf/*.tsx, gerados via
// renderToBuffer fora do pipeline normal de páginas do Next.js) não passam
// pelo request context que getTranslations()/useTranslations() dependem —
// aqui o locale do tenant é passado explícito. (Item 1 do roadmap,
// 06/08/2026.)
//
// O vocabulário passa pelo MESMO módulo que o request context usa. Até
// 20/08/2026 este caminho montava o tradutor com as mensagens CRUAS, e os
// marcadores saíam por aqui inteiros — "[[osC]] #1234" no e-mail, no WhatsApp
// e no recibo do cliente final da empresa.
//
// `vocabulario` é opcional: sem ele vale o padrão do idioma, que já é o texto
// correto. Quem tem o tenant em mãos passa `tenant.vocabulary` e o cliente vê
// a palavra que a empresa escolheu ("chamado", "atendimento").
export function getTranslator<NS extends keyof typeof ptMessages>(
  locale: "pt" | "en",
  namespace: NS,
  vocabulario: unknown = null
) {
  return createTranslator({
    locale,
    messages: mensagensComVocabulario(locale, vocabulario) as typeof ptMessages,
    namespace,
  })
}
