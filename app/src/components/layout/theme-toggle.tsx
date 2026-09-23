"use client"

import { useTranslations } from "next-intl"
import { Moon, Sun } from "lucide-react"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { definirTema, useTemaEscuro } from "@/lib/tema"

export function ThemeToggle() {
  // Reusa nav.lightMode/nav.darkMode, que já existiam no messages/*.json da
  // migração da sidebar, em vez de duplicar as mesmas duas strings.
  const t = useTranslations("nav")
  const escuro = useTemaEscuro()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => definirTema(!escuro)}>
        {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
        <span>{escuro ? t("lightMode") : t("darkMode")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
