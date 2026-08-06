import type { Metadata, Viewport } from "next"
import "./globals.css"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
const title = "ServiçoOS — Gestão de Ordens de Serviço"
const description = "CRM, OS, Financeiro e Dashboard para empresas de serviço"

export const metadata: Metadata = {
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
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
