"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { createServiceOrder, type OrderFormState } from "@/actions/service-orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

type Client = {
  id: string
  name: string
  /** O contratante, quando este cliente e subcliente de alguem. */
  parentId?: string | null
  parentName?: string | null
}
type TeamMember = { id: string; name: string; role: string }
type Item = { description: string; quantity: number; unitPrice: number }

type Props = {
  clients: Client[]
  teamMembers?: TeamMember[]
  defaultClientId?: string
}

export function ServiceOrderForm({ clients, teamMembers = [], defaultClientId }: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const tc = useTranslations("common")
  const [items, setItems] = useState<Item[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ])

  // O cliente escolhido vira ESTADO porque a pergunta seguinte depende dele:
  // so quem tem contratante precisa decidir quem paga. Sem isto o seletor de
  // pagador teria de aparecer sempre, e a maioria das empresas nunca usa
  // subcliente.
  const [clienteId, setClienteId] = useState(defaultClientId ?? "")
  const escolhido = clients.find((c) => c.id === clienteId)

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof Item, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: field === "description" ? value : Number(value) } : item
      )
    )
  }

  const [state, formAction, isPending] = useActionState<OrderFormState, FormData>(
    createServiceOrder,
    {}
  )

  function handleSubmit(formData: FormData) {
    formData.set("items", JSON.stringify(items))
    return formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.orderDataTitle")}</CardTitle>
        </CardHeader>
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
            <Label htmlFor="clientId">{t("form.clientLabel")}</Label>
            <Select name="clientId" value={clienteId} onValueChange={(v) => setClienteId(v ?? "")}>
              <SelectTrigger id="clientId">
                <SelectValue placeholder={t("form.clientPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
          </div>

          {/* So aparece quando ha escolha real a fazer: o cliente escolhido tem
              contratante. A administradora paga quase tudo, mas as vezes o
              cliente final paga direto um servico extra — e e nesse caso
              excepcional que a nota sairia no CNPJ errado. */}
          {escolhido?.parentId && (
            <div className="space-y-1.5">
              <Label htmlFor="payerId">{t("form.payerLabel")}</Label>
              <Select name="payerId" defaultValue={escolhido.parentId}>
                <SelectTrigger id="payerId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={escolhido.parentId}>{escolhido.parentName}</SelectItem>
                  <SelectItem value={escolhido.id}>{escolhido.name}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("form.payerHint")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="technicianId">{t("form.technicianLabel")}</Label>
            <Select name="technicianId">
              <SelectTrigger id="technicianId">
                <SelectValue placeholder={t("form.technicianPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scheduledAt">{t("form.scheduledLabel")}</Label>
            <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("form.itemsTitle")}</CardTitle>
          <Button type="button" variant="outline" onClick={addItem}>
            <Plus className="size-4 mr-1" />
            {t("items.addButton")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_80px_120px_32px] items-end">
              <div className="space-y-1.5">
                {index === 0 && <Label>{t("items.descriptionLabel")}</Label>}
                <Input
                  placeholder={t("items.descriptionPlaceholder")}
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && <Label>{t("items.quantityLabel")}</Label>}
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && <Label>{t("items.unitPriceLabel")}</Label>}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => removeItem(index)}
                disabled={items.length === 1}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <div className="flex justify-end pt-2 border-t">
            <p className="font-semibold">{t("items.totalLabel")} {formatCurrency(total)}</p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("form.createPending") : t("form.createSubmit")}
        </Button>
        <Link href="/service-orders" className={buttonVariants({ variant: "outline" })}>
          {tc("cancel")}
        </Link>
      </div>
    </form>
  )
}
