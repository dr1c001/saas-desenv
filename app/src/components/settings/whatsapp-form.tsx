"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { updateWhatsApp } from "@/actions/settings"
import { MessageCircle } from "lucide-react"

type Props = { zapiInstance: string | null; zapiToken: string | null }

export function WhatsAppForm({ zapiInstance, zapiToken }: Props) {
  const t = useTranslations("settingsCore")
  const tc = useTranslations("common")
  const [state, action, pending] = useActionState(updateWhatsApp, {})

  return (
    <form action={action} className="space-y-4">
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm space-y-2">
        <p className="font-medium flex items-center gap-2"><MessageCircle className="size-4 text-green-500" /> {t("whatsapp.howToTitle")}</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>{t.rich("whatsapp.step1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          <li>{t("whatsapp.step2")}</li>
          <li>{t.rich("whatsapp.step3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
        </ol>
      </div>
      <div>
        <label className="text-sm font-medium">{t("whatsapp.instanceLabel")}</label>
        <input
          name="zapiInstance"
          defaultValue={zapiInstance ?? ""}
          placeholder={t("whatsapp.instancePlaceholder")}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">{t("whatsapp.tokenLabel")}</label>
        <input
          name="zapiToken"
          defaultValue={zapiToken ?? ""}
          type="password"
          placeholder={t("whatsapp.tokenPlaceholder")}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? tc("saving") : t("whatsapp.submit")}
      </button>
    </form>
  )
}
