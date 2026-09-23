"use client"

import { useTransition } from "react"
import { useLocale } from "next-intl"
import { setPublicLocale } from "@/actions/locale"
import { cn } from "@/lib/utils"

// Versão do seletor de idioma pras páginas públicas (landing, login,
// cadastro, termos) — antes de existir tenant, então usa cookie em vez do
// Tenant.locale (ver actions/locale.ts). (Item 1 do roadmap, 06/08/2026.)
export function PublicLanguageToggle({ className }: { className?: string }) {
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  function set(next: "pt" | "en") {
    if (next === locale) return
    startTransition(() => {
      setPublicLocale(next)
    })
  }

  return (
    <div className={cn("inline-flex items-center rounded-lg border p-0.5 text-xs font-medium", className)}>
      <button
        type="button"
        onClick={() => set("pt")}
        disabled={isPending}
        aria-current={locale === "pt"}
        className={cn(
          "rounded-md px-2 py-1 transition-colors",
          locale === "pt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        PT
      </button>
      <button
        type="button"
        onClick={() => set("en")}
        disabled={isPending}
        aria-current={locale === "en"}
        className={cn(
          "rounded-md px-2 py-1 transition-colors",
          locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
    </div>
  )
}
