import type { Metadata, Viewport } from "next"
import "./globals.css"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
