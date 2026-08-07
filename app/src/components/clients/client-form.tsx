"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { createClient, updateClient, type ClientFormState } from "@/actions/clients"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

type Client = {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  status: string
  address?: {
    street: string | null
    number: string | null
    complement: string | null
    district: string | null
    city: string | null
    state: string | null
    zipCode: string | null
  } | null
}

type Props = { client?: Client }

export function ClientForm({ client }: Props) {
  const t = useTranslations("clients")
  const tc = useTranslations("common")

  const action = client
    ? updateClient.bind(null, client.id)
    : createClient

  const [state, formAction, isPending] = useActionState<ClientFormState, FormData>(
    action,
    {}
  )

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.personalDataTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="name">{t("form.nameLabel")}</Label>
            <Input id="name" name="name" defaultValue={client?.name} required />
            {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="document">{t("form.documentLabel")}</Label>
            <Input id="document" name="document" defaultValue={client?.document ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("form.phoneLabel")}</Label>
            <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">{t("form.whatsappLabel")}</Label>
            <Input id="whatsapp" name="whatsapp" placeholder={t("form.whatsappPlaceholder")} defaultValue={(client as { whatsapp?: string | null })?.whatsapp ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{t("form.emailLabel")}</Label>
            <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
            {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">{t("form.statusLabel")}</Label>
            <Select name="status" defaultValue={client?.status ?? "ACTIVE"}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{tc("clientStatus.ACTIVE")}</SelectItem>
                <SelectItem value="INACTIVE">{tc("clientStatus.INACTIVE")}</SelectItem>
                <SelectItem value="DEFAULTER">{tc("clientStatus.DEFAULTER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.addressTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zipCode">{t("form.zipCodeLabel")}</Label>
            <Input id="zipCode" name="zipCode" defaultValue={client?.address?.zipCode ?? ""} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="street">{t("form.streetLabel")}</Label>
            <Input id="street" name="street" defaultValue={client?.address?.street ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="number">{t("form.numberLabel")}</Label>
            <Input id="number" name="number" defaultValue={client?.address?.number ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complement">{t("form.complementLabel")}</Label>
            <Input id="complement" name="complement" defaultValue={client?.address?.complement ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="district">{t("form.districtLabel")}</Label>
            <Input id="district" name="district" defaultValue={client?.address?.district ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">{t("form.cityLabel")}</Label>
            <Input id="city" name="city" defaultValue={client?.address?.city ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">{t("form.stateLabel")}</Label>
            <Input id="state" name="state" maxLength={2} defaultValue={client?.address?.state ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? tc("saving") : client ? t("form.submitUpdate") : t("form.submitCreate")}
        </Button>
        <Link href="/clients" className={buttonVariants({ variant: "outline" })}>
          {tc("cancel")}
        </Link>
      </div>
    </form>
  )
}
