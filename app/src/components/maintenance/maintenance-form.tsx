"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Plus, Trash2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { createMaintenanceOrder, type MaintenanceFormState } from "@/actions/maintenance"

type Provider = { id: string; name: string; specialty: string | null }
type Item = { description: string; quantity: number; unitPrice: number }

export function MaintenanceForm({ providers }: { providers: Provider[] }) {
  const t = useTranslations("maintenance")
  const tc = useTranslations("common")
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, unitPrice: 0 }])
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  function addItem() { setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]) }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof Item, val: string | number) {
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [field]: field === "description" ? val : Number(val) } : item))
  }

  const [state, formAction, isPending] = useActionState<MaintenanceFormState, FormData>(createMaintenanceOrder, {})

  function handleSubmit(fd: FormData) {
    fd.set("items", JSON.stringify(items))
    return formAction(fd)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("form.orderDataTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="title">{t("form.titleLabel")}</Label>
            <Input id="title" name="title" placeholder={t("form.titlePlaceholder")} required />
            {state.errors?.title && <p className="text-sm text-destructive">{state.errors.title[0]}</p>}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">{t("form.descriptionLabel")}</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="providerId">{t("form.providerLabel")}</Label>
            <Select name="providerId">
              <SelectTrigger id="providerId">
                <SelectValue placeholder={t("form.providerPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.specialty ? ` — ${p.specialty}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduledAt">{t("form.scheduledAtLabel")}</Label>
            <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("form.itemsTitle")}</CardTitle>
          <Button type="button" variant="outline" onClick={addItem}>
            <Plus className="size-4 mr-1" />{t("form.addItemButton")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[1fr_80px_120px_32px] items-end">
              <div className="space-y-1.5">
                {i === 0 && <Label>{t("form.itemDescriptionLabel")}</Label>}
                <Input placeholder={t("form.itemDescriptionPlaceholder")} value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                {i === 0 && <Label>{t("form.itemQuantityLabel")}</Label>}
                <Input type="number" min="0.001" step="0.001" value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                {i === 0 && <Label>{t("form.itemUnitPriceLabel")}</Label>}
                <Input type="number" min="0" step="0.01" value={item.unitPrice}
                  onChange={(e) => updateItem(i, "unitPrice", e.target.value)} />
              </div>
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive"
                onClick={() => removeItem(i)} disabled={items.length === 1}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex justify-end pt-2 border-t">
            <p className="font-semibold">{t("form.totalLabel")} {formatCurrency(total)}</p>
          </div>
        </CardContent>
      </Card>

      <Separator />
      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("form.submitting") : t("form.submit")}
        </Button>
        <Link href="/maintenance" className={buttonVariants({ variant: "outline" })}>{tc("cancel")}</Link>
      </div>
    </form>
  )
}
