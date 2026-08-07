"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { updateTenant, type SettingsFormState } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Tenant = {
  name: string
  document: string | null
  logoUrl: string | null
  phone: string | null
  website: string | null
  address: string | null
} | null

export function TenantForm({ tenant }: { tenant: Tenant }) {
  const t = useTranslations("settingsCore")
  const tc = useTranslations("common")
  const [state, formAction, isPending] = useActionState<SettingsFormState, FormData>(
    updateTenant,
    {}
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("company.form.nameLabel")}</Label>
        <Input id="name" name="name" defaultValue={tenant?.name ?? ""} required />
        {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="document">{t("company.form.documentLabel")}</Label>
        <Input id="document" name="document" defaultValue={tenant?.document ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">{t("company.form.phoneLabel")}</Label>
        <Input id="phone" name="phone" placeholder={t("company.form.phonePlaceholder")} defaultValue={tenant?.phone ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">{t("company.form.addressLabel")}</Label>
        <Input id="address" name="address" placeholder={t("company.form.addressPlaceholder")} defaultValue={tenant?.address ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="website">{t("company.form.websiteLabel")}</Label>
        <Input id="website" name="website" placeholder={t("company.form.websitePlaceholder")} defaultValue={tenant?.website ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="logoUrl">{t("company.form.logoUrlLabel")}</Label>
        <Input
          id="logoUrl"
          name="logoUrl"
          type="url"
          placeholder={t("company.form.logoUrlPlaceholder")}
          defaultValue={tenant?.logoUrl ?? ""}
        />
        <p className="text-xs text-muted-foreground">{t("company.form.logoUrlHint")}</p>
        {tenant?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logoUrl} alt={t("company.form.logoAlt")} className="h-12 object-contain mt-1 rounded border" />
        )}
        {state.errors?.logoUrl && <p className="text-sm text-destructive">{state.errors.logoUrl[0]}</p>}
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? tc("saving") : tc("save")}
      </Button>
    </form>
  )
}
