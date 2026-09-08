"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ProviderFormState } from "@/actions/providers"

type Provider = {
  name: string
  document: string | null
  email: string | null
  phone: string | null
  specialty: string | null
  notes: string | null
} | null

type Props = {
  provider?: Provider
  action: (prev: ProviderFormState, data: FormData) => Promise<ProviderFormState>
}

export function ProviderForm({ provider, action }: Props) {
  const t = useTranslations("providers")
  const tc = useTranslations("common")
  const [state, formAction, isPending] = useActionState<ProviderFormState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("form.nameLabel")}</Label>
        <Input id="name" name="name" defaultValue={provider?.name ?? ""} required />
        {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="specialty">{t("form.specialtyLabel")}</Label>
        <Input id="specialty" name="specialty" placeholder={t("form.specialtyPlaceholder")} defaultValue={provider?.specialty ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("form.phoneLabel")}</Label>
          <Input id="phone" name="phone" placeholder={t("form.phonePlaceholder")} defaultValue={provider?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="document">{t("form.documentLabel")}</Label>
          <Input id="document" name="document" defaultValue={provider?.document ?? ""} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("form.emailLabel")}</Label>
        <Input id="email" name="email" type="email" defaultValue={provider?.email ?? ""} />
        {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t("form.notesLabel")}</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={provider?.notes ?? ""} />
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? tc("saving") : tc("save")}
      </Button>
    </form>
  )
}
