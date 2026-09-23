import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { AmbienteBanner } from "@/components/layout/ambiente-banner"
import { getLocale, getMessages, getTranslations } from "next-intl/server"
import "./globals.css"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const isEn = locale === "en"
  // O texto que aparece no Google e no preview de QUALQUER link compartilhado.
  //
  // Eram quatro literais aqui dentro, fora do next-intl, ainda vendendo o
  // posicionamento horizontal recolhido em 08/09/2026: "CRM, OS, Financeiro e
  // Dashboard para empresas de serviço" — lista de módulos internos, em jargão.
  // "CRM" e "Dashboard" não são palavras de quem tem desentupidora, e o
  // comentário em demo/page.tsx já registrava isso sobre esta mesma frase.
  // (Achado na auditoria de 13/09/2026, grupo 9.)
  const t = await getTranslations("landing.meta")
  const title = t("title")
  const description = t("description")

  return {
    metadataBase: new URL(appUrl),
    title: { default: title, template: "%s · ServiçoOS" },
    description,
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "ServiçoOS",
    },
    openGraph: {
      title,
      description,
      url: "/",
      siteName: "ServiçoOS",
      locale: isEn ? "en_US" : "pt_BR",
      type: "website",
    },
    twitter: {
      // `summary` mostra a figura como miniatura ao lado do texto; o cartão
      // é 1200×630 e foi desenhado para ocupar a largura toda.
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export const viewport: Viewport = {
  themeColor: "#7c3aed",
}

// Roda antes do React hidratar, pra decidir claro/escuro sem "flash" de tela
// virando a cor errada por uma fração de segundo — o servidor não tem como
// saber a preferência salva (localStorage) nem a do sistema operacional do
// visitante, então isso precisa rodar no client antes da primeira pintura.
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale === "en" ? "en-US" : "pt-BR"} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Fora do provider de i18n de propósito: o texto é fixo e precisa
            aparecer mesmo se a tradução falhar. Some sozinho em produção. */}
        <AmbienteBanner />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
