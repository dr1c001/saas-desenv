import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { isSuperAdmin } from "@/lib/admin"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A regra de quem é o dono da plataforma saiu daqui pra lib/admin.ts, porque
  // este layout não protegia as Server Actions do painel — cada uma delas
  // agora chama requireSuperAdmin() por conta própria.
  if (!(await isSuperAdmin())) redirect("/dashboard")

  const t = await getTranslations("mapAdmin")

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t("admin.layout.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("admin.layout.subtitle")}</p>
        </div>
        <a href="/dashboard" className="text-sm text-muted-foreground hover:underline">← {t("admin.layout.backToApp")}</a>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
