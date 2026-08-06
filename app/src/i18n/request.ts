import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export const LOCALES = ["pt", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "pt"

function isValidLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

// Fonte do idioma: se tem sessão, é o idioma da empresa (Tenant.locale) —
// assim toda a equipe e os e-mails/PDFs gerados pra aquele tenant saem no
// mesmo idioma, mesmo fora de uma sessão de navegador (cron, webhook). Sem
// sessão (páginas públicas), cai pro cookie escolhido pelo visitante.
// Centralizado aqui uma vez só — getTranslations()/useTranslations() em
// qualquer parte do app usam isso automaticamente, sem precisar passar
// locale manualmente em cada página. (Item 1 do roadmap, 06/08/2026.)
async function resolveLocale(): Promise<Locale> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { tenant: { select: { locale: true } } },
      })
      if (isValidLocale(dbUser?.tenant.locale)) return dbUser.tenant.locale
    }
  } catch {
    // sem sessão válida, sem User ainda (primeiro login) — cai pro cookie
  }

  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("locale")?.value
  return isValidLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
