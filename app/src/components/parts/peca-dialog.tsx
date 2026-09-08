"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Pencil, Plus, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { paraCampo } from "@/lib/dinheiro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { alternarPeca, salvarPeca, type EstadoPeca } from "@/actions/estoque"
import { UNIDADES } from "@/lib/estoque"

type Peca = {
  id: string
  name: string
  sku: string | null
  unit: string
  costPrice: number | null
  salePrice: number | null
  minStock: number
  active: boolean
}

export function PecaDialog({ peca }: { peca?: Peca }) {
  const t = useTranslations("estoque")
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, salvando] = useActionState<EstadoPeca, FormData>(
    salvarPeca.bind(null, peca?.id ?? null),
    {}
  )

  // Fecha sozinho quando salvou.
  if (estado.ok && aberto) setTimeout(() => setAberto(false), 0)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          peca ? (
            <Button size="sm" variant="ghost" className="gap-1" />
          ) : (
            <Button className="gap-1.5" />
          )
        }
      >
        {peca ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        {peca ? "" : t("nova")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{peca ? t("editarPeca") : t("novaPeca")}</DialogTitle>
          <DialogDescription>{t("formAjuda")}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("campos.nome")}</Label>
            <Input id="name" name="name" required maxLength={120} defaultValue={peca?.name} />
            {estado.errors?.name && (
              <p className="text-xs text-destructive">{estado.errors.name[0]}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sku">{t("campos.codigo")}</Label>
              <Input id="sku" name="sku" maxLength={40} defaultValue={peca?.sku ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">{t("campos.unidade")}</Label>
              <select
                id="unit"
                name="unit"
                defaultValue={peca?.unit ?? "un"}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* `paraCampo`, e não o número cru.
                O cru saía com PONTO decimal ("12.5"), e o parser da Action lia
                ponto como separador de milhar — abrir a peça de R$ 12,50 e
                salvar sem tocar em nada gravava R$ 125,00. Dez vezes, calado.
                Ver lib/dinheiro.ts. */}
            <div className="space-y-2">
              <Label htmlFor="costPrice">{t("campos.custo")}</Label>
              <Input
                id="costPrice"
                name="costPrice"
                inputMode="decimal"
                defaultValue={paraCampo(peca?.costPrice)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salePrice">{t("campos.venda")}</Label>
              <Input
                id="salePrice"
                name="salePrice"
                inputMode="decimal"
                defaultValue={paraCampo(peca?.salePrice)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">{t("campos.minimo")}</Label>
              <Input id="minStock" name="minStock" inputMode="decimal" defaultValue={peca?.minStock ?? ""} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("campos.minimoAjuda")}</p>

          {/* O saldo não é editável aqui de propósito: ele só muda por
              movimento, pra o histórico e o número na tela nunca discordarem. */}
          {peca && <p className="text-xs text-muted-foreground">{t("campos.saldoAviso")}</p>}

          {estado.message && <p className="text-sm text-destructive">{estado.message}</p>}

          <DialogFooter className="gap-2">
            {peca && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto gap-1.5"
                onClick={() => alternarPeca(peca.id).then(() => setAberto(false))}
              >
                <Power className="size-3.5" />
                {peca.active ? t("desativar") : t("reativar")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
