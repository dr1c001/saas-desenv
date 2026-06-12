"use client"

import { useActionState, useState } from "react"
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

type Client = { id: string; name: string }
type Item = { description: string; quantity: number; unitPrice: number }

type Props = {
  clients: Client[]
  defaultClientId?: string
}

export function ServiceOrderForm({ clients, defaultClientId }: Props) {
  const [items, setItems] = useState<Item[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ])

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
          <CardTitle className="text-base">Dados da OS</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" name="title" placeholder="Ex: Manutenção elétrica" required />
            {state.errors?.title && <p className="text-sm text-destructive">{state.errors.title[0]}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clientId">Cliente *</Label>
            <Select name="clientId" defaultValue={defaultClientId}>
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Selecione um cliente" />
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

          <div className="space-y-1.5">
            <Label htmlFor="scheduledAt">Agendamento</Label>
            <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Itens / Serviços</CardTitle>
          <Button type="button" variant="outline" onClick={addItem}>
            <Plus className="size-4 mr-1" />
            Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_80px_120px_32px] items-end">
              <div className="space-y-1.5">
                {index === 0 && <Label>Descrição</Label>}
                <Input
                  placeholder="Descrição do serviço/peça"
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && <Label>Qtd.</Label>}
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && <Label>Preço unit.</Label>}
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
            <p className="font-semibold">Total: {formatCurrency(total)}</p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando OS..." : "Criar OS"}
        </Button>
        <Link href="/service-orders" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
