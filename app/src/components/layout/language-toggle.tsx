"use client"

import { useTransition } from "react"
import { useLocale } from "next-intl"
import { Languages } from "lucide-react"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { updateLocale } from "@/actions/settings"

// Idioma é por empresa (Tenant.locale), não por dispositivo — visível só pra
// quem tem permissão de trocar (updateLocale já valida OWNER/ADMIN de novo
// no servidor, isso aqui só evita mostrar um botão que vai falhar em
// silêncio pra quem não pode usar). Nomes dos idiomas ficam sempre na
// própria língua ("Português"/"English"), convenção padrão de seletor de
// idioma — não são traduzidos pelo locale atual. (Item 1 do roadmap,
// 06/08/2026.)
export function LanguageToggle({ canChange }: { canChange: boolean }) {
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  if (!canChange) return null

  function toggle() {
    startTransition(() => {
      updateLocale(locale === "pt" ? "en" : "pt")
    })
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggle} disabled={isPending}>
        <Languages className="size-4" />
        <span>{locale === "pt" ? "English" : "Português"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
