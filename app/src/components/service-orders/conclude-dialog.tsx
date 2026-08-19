"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Trash2, CheckCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { completeServiceOrder } from "@/actions/service-orders"
import { enfileirar, semRede } from "@/lib/usar-fila-offline"

type Item = { description: string; quantity: number; unitPrice: number }

type Props = {
  orderId: string
  orderTitle: string
  currentStatus: string
  initialConclusionNote?: string | null
  initialItems?: Item[]
}

export function ConcluirDialog({
  orderId,
  orderTitle,
  currentStatus,
  initialConclusionNote,
  initialItems,
}: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const tc = useTranslations("common")
  const isConcluded = currentStatus === "DONE" || currentStatus === "INVOICED" || currentStatus === "CANCELLED"
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [conclusionNote, setConclusionNote] = useState(initialConclusionNote ?? "")
  const [items, setItems] = useState<Item[]>(
    initialItems && initialItems.length > 0 ? initialItems : [{ description: "", quantity: 1, unitPrice: 0 }]
  )
  const [error, setError] = useState<string | null>(null)

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  function addItem() { setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]) }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof Item, val: string | number) {
    setItems((p) => p.map((item, idx) =>
      idx === i ? { ...item, [field]: field === "description" ? val : Number(val) } : item
    ))
  }

  function handleConclude(invoice: boolean) {
    setError(null)
    startTransition(async () => {
      // Sem rede, guarda pra enviar depois em vez de falhar. O tecnico esta
      // no subsolo e o servico ACONTECEU — recusar aqui faria o trabalho
      // virar bilhete no bolso, que na pratica vira nunca.
      //
      // Com rede, nada muda: vai direto, como sempre foi, e o erro real chega
      // ao tecnico. Trocar um caminho testado por um caminho novo em 99% dos
      // casos nao traria ganho nenhum.
      if (semRede()) {
        await enfileirar("CONCLUIR_OS", orderId, {
          conclusionNote,
          items,
          invoiceImmediately: invoice,
        })
        setOpen(false)
        return
      }

      try {
        await completeServiceOrder(orderId, conclusionNote, items, invoice)
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : t("concludeDialog.concludeError"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" />
        }
      >
        <CheckCircle className="size-3.5" />
        {isConcluded ? t("concludeDialog.editTrigger") : t("concludeDialog.trigger")}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("concludeDialog.title")}</DialogTitle>
          <DialogDescription>{orderTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Descrição do serviço realizado */}
          <div className="space-y-1.5">
            <Label htmlFor="conclusionNote">{t("concludeDialog.notesLabel")}</Label>
            <Textarea
              id="conclusionNote"
              rows={3}
              placeholder={t("concludeDialog.notesPlaceholder")}
              value={conclusionNote}
              onChange={(e) => setConclusionNote(e.target.value)}
            />
          </div>

          {/* Itens cobrados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("concludeDialog.itemsLabel")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-3.5 mr-1" />
                {t("items.addButton")}
              </Button>
            </div>

            {items.map((item, i) => (
              <div key={i} className="grid gap-2 grid-cols-[1fr_70px_110px_28px] items-end">
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("items.descriptionLabel")}</p>}
                  <Input
                    placeholder={t("concludeDialog.itemDescriptionPlaceholder")}
                    value={item.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("items.quantityLabel")}</p>}
                  <Input
                    type="number" min="0.001" step="0.001"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("concludeDialog.itemUnitPriceLabel")}</p>}
                  <Input
                    type="number" min="0" step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                  />
                </div>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="text-destructive hover:text-destructive self-end"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex justify-end pt-2 border-t">
              <p className="font-semibold text-sm">{t("items.totalLabel")} <span className="text-base">{formatCurrency(total)}</span></p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t">
            <Button
              className="flex-1"
              variant="outline"
              disabled={isPending}
              onClick={() => handleConclude(false)}
            >
              {isPending ? tc("saving") : isConcluded ? t("concludeDialog.saveNoInvoice") : t("concludeDialog.concludeNoInvoice")}
            </Button>
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={() => handleConclude(true)}
            >
              {isPending ? tc("saving") : isConcluded ? t("concludeDialog.saveAndInvoice") : t("concludeDialog.concludeAndInvoice")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
