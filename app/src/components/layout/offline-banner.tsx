"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { WifiOff } from "lucide-react"

function assinar(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

const estaOnline = () => navigator.onLine
// No servidor assume online: renderizar o aviso no HTML faria ele piscar na
// tela de todo mundo antes do React hidratar e descobrir que há sinal.
const noServidor = () => true

// Sem isto, o técnico offline vê a tela normal e não tem como saber que está
// olhando uma cópia guardada no aparelho — dado velho passando por dado atual
// é pior que erro visível. (useSyncExternalStore em vez de useState+useEffect
// pelo mesmo motivo do theme-toggle: evita setState dentro de efeito.)
export function OfflineBanner() {
  const online = useSyncExternalStore(assinar, estaOnline, noServidor)
  const t = useTranslations("offline")

  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        <strong className="font-medium">{t("banner.title")}</strong> {t("banner.description")}
      </span>
    </div>
  )
}
