import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { isSuperAdmin } from "@/lib/admin"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A regra de quem é o dono da plataforma saiu daqui pra lib/admin.ts, porque
  // este layout não protegia as Server Actions do painel — cada uma delas
  // agora chama requireSuperAdmin() por conta própria.
  if (!(await isSuperAdmin())) redirect("/dashboard")

  // "Voltar ao sistema" leva pro /dashboard, que exige pertencer a uma
  // empresa. Quem administra a plataforma sem ser cliente dela não tem
  // empresa: o /dashboard devolve pro /admin e o link vira um vai-e-volta
  // infinito. Só mostra quando há pra onde voltar.
  // (Achado no ambiente de teste em 11/08/2026 — vale igual em produção.)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const temEmpresa = user
    ? (await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } })) !== null
    : false

  const t = await getTranslations("mapAdmin")

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t("admin.layout.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("admin.layout.subtitle")}</p>
        </div>
        {temEmpresa ? (
          <a href="/dashboard" className="text-sm text-muted-foreground hover:underline">← {t("admin.layout.backToApp")}</a>
        ) : (
          <span className="text-xs text-muted-foreground">{t("admin.layout.noCompany")}</span>
        )}
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
