import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import {
  aplicarNasMensagens,
  lerVocabulario,
  tabelaDeTrocas,
  VOCABULARIO_PADRAO,
} from "@/lib/vocabulario"

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
//
// O vocabulário da empresa vem na MESMA consulta: como ele é aplicado sobre as
// mensagens aqui, buscá-lo em outro lugar significaria uma query a mais em
// toda página do sistema.
async function resolverContexto(): Promise<{ locale: Locale; vocabulario: unknown }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { tenant: { select: { locale: true, vocabulary: true } } },
      })
      if (isValidLocale(dbUser?.tenant.locale)) {
        return { locale: dbUser.tenant.locale, vocabulario: dbUser.tenant.vocabulary }
      }
    }
  } catch {
    // sem sessão válida, sem User ainda (primeiro login) — cai pro cookie
  }

  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("locale")?.value
  // Visitante não logado vê o vocabulário padrão: a landing e as páginas
  // públicas não pertencem a nenhuma empresa.
  return { locale: isValidLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE, vocabulario: null }
}

// Trocar os marcadores percorre ~1400 textos. É barato, mas roda em TODA
// requisição — e o resultado só muda quando a empresa altera o vocabulário.
// A chave inclui o vocabulário inteiro, então mudar a configuração invalida
// sozinho, sem precisar limpar nada.
const cacheMensagens = new Map<string, unknown>()

async function mensagensComVocabulario(locale: Locale, vocabularioGravado: unknown) {
  const vocabulario = lerVocabulario(vocabularioGravado, locale)
  const chave = `${locale}:${JSON.stringify(vocabulario)}`

  const emCache = cacheMensagens.get(chave)
  if (emCache) return emCache

  const originais = (await import(`../../messages/${locale}.json`)).default
  const aplicadas = aplicarNasMensagens(originais, tabelaDeTrocas(vocabulario))

  // Teto pra não crescer sem limite num servidor com muitos tenants: o padrão
  // (a maioria das empresas) fica sempre, os customizados rodam.
  if (cacheMensagens.size > 50) {
    for (const k of cacheMensagens.keys()) {
      if (!k.endsWith(JSON.stringify(VOCABULARIO_PADRAO[locale]))) {
        cacheMensagens.delete(k)
        break
      }
    }
  }
  cacheMensagens.set(chave, aplicadas)
  return aplicadas
}

export default getRequestConfig(async () => {
  const { locale, vocabulario } = await resolverContexto()
  return {
    locale,
    messages: (await mensagensComVocabulario(locale, vocabulario)) as Record<string, unknown>,
  }
})
