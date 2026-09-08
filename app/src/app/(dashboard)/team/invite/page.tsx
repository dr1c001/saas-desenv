"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { inviteTeamMember, type TeamFormState } from "@/actions/team"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { CARGOS_ATRIBUIVEIS } from "@/lib/cargos"

export default function InvitePage() {
  const [state, action, isPending] = useActionState<TeamFormState, FormData>(inviteTeamMember, {})
  const t = useTranslations("team.invite")
  const tc = useTranslations("common")

  if (state.success) {
    return (
      <div className="max-w-md space-y-4">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-12 text-green-600" />
          <h2 className="text-xl font-bold">{t("successTitle")}</h2>
          <p className="text-muted-foreground text-sm">{state.message}</p>
          <div className="flex gap-2">
            <Link href="/team" className={buttonVariants()}>{t("viewTeam")}</Link>
            <Link href="/team/invite" className={buttonVariants({ variant: "outline" })}>{t("inviteAnother")}</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("form.nameLabel")}</Label>
              <Input id="name" name="name" placeholder={t("form.namePlaceholder")} />
              {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("form.emailLabel")}</Label>
              <Input id="email" name="email" type="email" placeholder={t("form.emailPlaceholder")} />
              {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">{t("form.roleLabel")}</Label>
              <Select name="role" defaultValue="TECHNICIAN">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Montado a partir do catálogo: um cargo novo em
                      lib/cargos.ts aparece aqui sozinho, sem ninguém
                      precisar lembrar de mexer nesta tela. */}
                  {CARGOS_ATRIBUIVEIS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tc(`roles.${c}` as "roles.ADMIN")}
                      {c === "ADMIN" ? ` — ${t("form.acessoTotal")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="document">{t("form.documentLabel")}</Label>
              <Input id="document" name="document" placeholder={t("form.documentPlaceholder")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("form.phoneLabel")}</Label>
              <Input id="phone" name="phone" placeholder={t("form.phonePlaceholder")} />
            </div>

            <p className="text-sm font-medium pt-1">{t("form.addressTitle")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="street">{t("form.streetLabel")}</Label>
                <Input id="street" name="street" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="number">{t("form.numberLabel")}</Label>
                <Input id="number" name="number" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="complement">{t("form.complementLabel")}</Label>
                <Input id="complement" name="complement" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="district">{t("form.districtLabel")}</Label>
                <Input id="district" name="district" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zipCode">{t("form.zipCodeLabel")}</Label>
                <Input id="zipCode" name="zipCode" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">{t("form.cityLabel")}</Label>
                <Input id="city" name="city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">{t("form.stateLabel")}</Label>
                <Input id="state" name="state" maxLength={2} />
              </div>
            </div>

            {state.message && !state.success && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? t("submitting") : t("submit")}
              </Button>
              <Link href="/team" className={buttonVariants({ variant: "outline" })}>
                {tc("cancel")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
