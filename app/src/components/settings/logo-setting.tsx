"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ImageUp, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enviarLogo, removerLogo, type LogoFormState } from "@/actions/settings"

// Antes isto era um campo de URL: a empresa tinha que hospedar a imagem em
// algum lugar e colar o endereço. Agora é escolher o arquivo do computador ou
// do celular — o servidor redimensiona e guarda.
export function LogoSetting({ logoAtual }: { logoAtual: string | null }) {
  const t = useTranslations("settingsCore.company.logo")
  const [estado, formAction, enviando] = useActionState<LogoFormState, FormData>(enviarLogo, {})
  const [removendo, startTransition] = useTransition()
  const [previa, setPrevia] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const mostrando = previa ?? logoAtual

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      {mostrando && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mostrando} alt={t("alt")} className="h-14 object-contain rounded border bg-white p-1" />
          {logoAtual && !previa && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removendo}
              onClick={() => startTransition(() => removerLogo())}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("remove")}
            </Button>
          )}
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          // Prévia imediata: a pessoa vê o que escolheu antes de salvar, em vez
          // de enviar no escuro e descobrir depois que pegou o arquivo errado.
          onChange={(e) => {
            const f = e.target.files?.[0]
            setPrevia(f ? URL.createObjectURL(f) : null)
          }}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        <Button type="submit" size="sm" disabled={enviando || !previa}>
          {enviando ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <ImageUp className="size-3.5 mr-1.5" />}
          {t("save")}
        </Button>
      </form>

      {estado.message && (
        <p className={`text-sm ${estado.success ? "text-green-600" : "text-destructive"}`}>
          {estado.message}
        </p>
      )}
    </div>
  )
}
