import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const SUPER_ADMIN_EMAIL = "adrielwellington02@gmail.com"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">ServiçoOS — Painel do Administrador</h1>
          <p className="text-xs text-muted-foreground">Visão geral de todos os clientes do sistema</p>
        </div>
        <a href="/dashboard" className="text-sm text-muted-foreground hover:underline">← Voltar ao sistema</a>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
