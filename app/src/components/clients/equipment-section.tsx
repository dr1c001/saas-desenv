"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { createEquipment, deleteEquipment } from "@/actions/equipment"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { Wrench, Plus, Trash2, ChevronDown, ChevronUp, CalendarClock } from "lucide-react"

type Equipment = {
  id: string
  name: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  installDate: Date | null
  warrantyUntil: Date | null
  notes: string | null
}

export function EquipmentSection({ clientId, equipments }: { clientId: string; equipments: Equipment[] }) {
  const t = useTranslations("clients")
  const tc = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const today = new Date()
  const warrantyExpiring = equipments.filter(
    (e) => e.warrantyUntil && e.warrantyUntil > today && e.warrantyUntil < new Date(today.getTime() + 90 * 864e5)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="size-4" />
          {t("equipment.title")}
          <span className="ml-auto text-sm font-normal text-muted-foreground">{t("equipment.countLabel", { count: equipments.length })}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {warrantyExpiring.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0" />
            {t("equipment.warrantyWarning", { count: warrantyExpiring.length })}
          </div>
        )}

        {equipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("equipment.emptyState")}</p>
        ) : (
          <ul className="space-y-2">
            {equipments.map((eq) => {
              const warrantyOk = eq.warrantyUntil && eq.warrantyUntil > today
              const warrantySoon = warrantyOk && eq.warrantyUntil! < new Date(today.getTime() + 90 * 864e5)
              return (
                <li key={eq.id} className="rounded-lg border p-3 text-sm space-y-1 group relative">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{eq.name}</p>
                    <button
                      onClick={() => startTransition(() => deleteEquipment(eq.id, clientId))}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                    {eq.brand && <span>{t("equipment.brand")} {eq.brand}</span>}
                    {eq.model && <span>{t("equipment.model")} {eq.model}</span>}
                    {eq.serialNumber && <span>{t("equipment.serialNumber")} {eq.serialNumber}</span>}
                    {eq.installDate && <span>{t("equipment.installDate")} {new Date(eq.installDate).toLocaleDateString("pt-BR")}</span>}
                    {eq.warrantyUntil && (
                      <span className={warrantySoon ? "text-yellow-600" : warrantyOk ? "text-green-600" : "text-red-500"}>
                        {t("equipment.warrantyUntil")} {new Date(eq.warrantyUntil).toLocaleDateString("pt-BR")}
                        {!warrantyOk && ` (${t("equipment.warrantyExpired")})`}
                        {warrantySoon && " ⚠️"}
                      </span>
                    )}
                  </div>
                  {eq.notes && <p className="text-xs text-muted-foreground italic">{eq.notes}</p>}
                </li>
              )
            })}
          </ul>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className={buttonVariants({ variant: "outline", size: "sm" }) + " w-full"}
        >
          {open ? <ChevronUp className="size-3.5 mr-1" /> : <Plus className="size-3.5 mr-1" />}
          {open ? tc("cancel") : t("equipment.addButton")}
        </button>

        {open && (
          <form
            action={async (fd) => {
              startTransition(() => createEquipment(clientId, fd))
              setOpen(false)
            }}
            className="grid grid-cols-2 gap-3 border rounded-lg p-4"
          >
            <div className="col-span-2">
              <label className="text-xs font-medium">{t("equipment.nameLabel")}</label>
              <input name="name" required className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" placeholder={t("equipment.namePlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium">{t("equipment.brandLabel")}</label>
              <input name="brand" className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" placeholder={t("equipment.brandPlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium">{t("equipment.modelLabel")}</label>
              <input name="model" className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" placeholder={t("equipment.modelPlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium">{t("equipment.serialNumberLabel")}</label>
              <input name="serialNumber" className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium">{t("equipment.installDateLabel")}</label>
              <input name="installDate" type="date" className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium">{t("equipment.warrantyUntilLabel")}</label>
              <input name="warrantyUntil" type="date" className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">{t("equipment.notesLabel")}</label>
              <textarea name="notes" rows={2} className="w-full mt-1 rounded border bg-background px-3 py-1.5 text-sm resize-none" />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {tc("cancel")}
              </button>
              <button type="submit" disabled={pending} className={buttonVariants({ size: "sm" })}>
                {pending ? tc("saving") : t("equipment.saveButton")}
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
