"use client"

import { useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { updateLocale } from "@/actions/settings"

// Nomes de idioma ficam sempre na própria língua ("Português"/"English"),
// convenção padrão de seletor de idioma — não são traduzidos pelo locale atual.
const LANGUAGE_NAMES = { pt: "Português", en: "English" } as const

// Antes isto era um botão na barra lateral, onde um clique trocava o idioma da
// empresa inteira sem confirmação — foi assim que a conta de uma cliente
// brasileira acabou em inglês (incidente de 07/08/2026, seção 7.2.1). Agora
// vive em Configurações, junto das outras decisões de empresa, e exige
// confirmação explícita dizendo o que a mudança afeta.
export function LanguageSetting() {
  const locale = useLocale() as "pt" | "en"
  const t = useTranslations("settingsCore.language")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const next = locale === "pt" ? "en" : "pt"
  const nextName = LANGUAGE_NAMES[next]

  function confirm() {
    startTransition(async () => {
      await updateLocale(next)
      setOpen(false)
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <p className="text-sm">{t("current", { language: LANGUAGE_NAMES[locale] })}</p>

      <Button variant="outline" onClick={() => setOpen(true)}>
        <Languages className="size-4 mr-2" />
        {t("switchTo", { language: nextName })}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">{t("confirmBody")}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button onClick={confirm} disabled={isPending}>
              {isPending ? t("changing") : t("confirm", { language: nextName })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
