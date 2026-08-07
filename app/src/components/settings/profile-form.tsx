"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { updateProfile, type SettingsFormState } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type UserAddress = {
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  zipCode: string | null
} | null

type User = {
  name: string
  email: string
  role: string
  document: string | null
  phone: string | null
  userAddress: UserAddress
} | null

const ROLE_KEYS = ["OWNER", "ADMIN", "TECHNICIAN"] as const

export function ProfileForm({ user }: { user: User }) {
  const t = useTranslations("settingsCore")
  const tc = useTranslations("common")
  const [state, formAction, isPending] = useActionState<SettingsFormState, FormData>(
    updateProfile,
    {}
  )
  const addr = user?.userAddress
  // Mantém o fallback original: role desconhecido (ex: valor novo no banco
  // ainda sem tradução) é exibido cru em vez de virar a chave literal.
  const role = user?.role ?? ""
  const roleLabel = (ROLE_KEYS as readonly string[]).includes(role)
    ? tc(`roles.${role}` as "roles.OWNER")
    : role

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">{t("profile.form.nameLabel")}</Label>
        <Input id="profile-name" name="name" defaultValue={user?.name ?? ""} required />
        {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>{t("profile.form.emailLabel")}</Label>
        <Input value={user?.email ?? ""} disabled className="opacity-60" readOnly />
        <p className="text-xs text-muted-foreground">{t("profile.form.emailHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label>{t("profile.form.roleLabel")}</Label>
        <Input value={roleLabel} disabled className="opacity-60" readOnly />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-document">{t("profile.form.documentLabel")}</Label>
        <Input id="profile-document" name="document" defaultValue={user?.document ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-phone">{t("profile.form.phoneLabel")}</Label>
        <Input id="profile-phone" name="phone" placeholder={t("profile.form.phonePlaceholder")} defaultValue={user?.phone ?? ""} />
      </div>

      <p className="text-sm font-medium pt-2">{t("profile.form.addressTitle")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="street">{t("profile.form.streetLabel")}</Label>
          <Input id="street" name="street" defaultValue={addr?.street ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="number">{t("profile.form.numberLabel")}</Label>
          <Input id="number" name="number" defaultValue={addr?.number ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complement">{t("profile.form.complementLabel")}</Label>
          <Input id="complement" name="complement" defaultValue={addr?.complement ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="district">{t("profile.form.districtLabel")}</Label>
          <Input id="district" name="district" defaultValue={addr?.district ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zipCode">{t("profile.form.zipCodeLabel")}</Label>
          <Input id="zipCode" name="zipCode" defaultValue={addr?.zipCode ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">{t("profile.form.cityLabel")}</Label>
          <Input id="city" name="city" defaultValue={addr?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">{t("profile.form.stateLabel")}</Label>
          <Input id="state" name="state" maxLength={2} defaultValue={addr?.state ?? ""} />
        </div>
      </div>

      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? tc("saving") : tc("save")}
      </Button>
    </form>
  )
}
