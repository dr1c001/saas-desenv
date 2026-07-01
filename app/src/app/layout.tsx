import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ServiçoOS — Gestão de Ordens de Serviço",
  description: "CRM, OS, Financeiro e Dashboard para empresas de serviço",
  manifest: "/manifest.json",
  themeColor: "#7c3aed",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ServiçoOS",
  },
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
