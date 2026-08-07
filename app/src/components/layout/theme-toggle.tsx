"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Moon, Sun } from "lucide-react"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

// document.documentElement.classList é estado externo ao React (mutado pelo
// script inline em layout.tsx antes da hidratação, e por setTheme() abaixo)
// — useSyncExternalStore evita o "setState dentro de useEffect" que o lint
// deste projeto já pegou antes em use-mobile.ts, e resolve corretamente a
// diferença entre o que o servidor não tem como saber e o valor real do
// client depois de hidratar.
const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark")
}

function getServerSnapshot() {
  return false
}

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark)
  localStorage.setItem("theme", dark ? "dark" : "light")
  listeners.forEach((notify) => notify())
}

export function ThemeToggle() {
  // Renderizado dentro do SidebarFooter — reusa nav.lightMode/nav.darkMode,
  // que já existiam no messages/*.json da migração da sidebar, em vez de
  // duplicar as mesmas duas strings num namespace próprio.
  const t = useTranslations("nav")
  const isDark = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => setTheme(!isDark)}>
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        <span>{isDark ? t("lightMode") : t("darkMode")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
