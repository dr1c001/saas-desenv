import { createTranslator } from "next-intl"
import ptMessages from "../../messages/pt.json"
import enMessages from "../../messages/en.json"

const MESSAGES = { pt: ptMessages, en: enMessages }

// E-mails (lib/resend.ts) e PDFs (components/pdf/*.tsx, gerados via
// renderToBuffer fora do pipeline normal de páginas do Next.js) não passam
// pelo request context que getTranslations()/useTranslations() dependem —
// aqui o locale do tenant é passado explícito. (Item 1 do roadmap,
// 06/08/2026.)
export function getTranslator<NS extends keyof typeof ptMessages>(locale: "pt" | "en", namespace: NS) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace })
}
