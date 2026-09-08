"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Ban, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cancelarCompra } from "@/actions/compras"

export function CancelarCompraButton({ id }: { id: string }) {
  const t = useTranslations("compras")
  const [aberto, setAberto] = useState(false)
  const [pendente, startTransition] = useTransition()

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1 text-destructive" />}>
        <Ban className="size-3.5" />
        {t("cancelar")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancelarCompra")}</DialogTitle>
          <DialogDescription>{t("cancelarAviso")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
            {t("voltarBotao")}
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                await cancelarCompra(id)
                setAberto(false)
              })
            }
            disabled={pendente}
          >
            {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {t("confirmarCancelamento")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
