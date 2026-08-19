"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { criarCompra, type EstadoCompra } from "@/actions/compras"
import { totalDaCompra } from "@/lib/compras"
import { formatCurrency } from "@/lib/utils"

type Peca = { id: string; name: string; sku: string | null; unit: string; costPrice: number | null }
type Fornecedor = { id: string; name: string }
type Linha = { partId: string; quantity: string; unitCost: string }

export function CompraDialog({
  fornecedores,
  pecas,
}: {
  fornecedores: Fornecedor[]
  pecas: Peca[]
}) {
  const t = useTranslations("compras")
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [linhas, setLinhas] = useState<Linha[]>([{ partId: "", quantity: "1", unitCost: "" }])
  const [estado, formAction, salvando] = useActionState<EstadoCompra, FormData>(criarCompra, {})

  if (estado.ok && estado.id && aberto) {
    setTimeout(() => {
      setAberto(false)
      router.push(`/purchases/${estado.id}`)
    }, 0)
  }

  const alterar = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))

  // Escolher a peça já traz o último custo pago: é quase sempre o valor certo,
  // e digitar de novo é onde entra erro de digitação.
  const escolherPeca = (i: number, partId: string) => {
    const peca = pecas.find((p) => p.id === partId)
    setLinhas((atual) =>
      atual.map((l, idx) =>
        idx === i
          ? { ...l, partId, unitCost: l.unitCost || (peca?.costPrice ? String(peca.costPrice) : "") }
          : l
      )
    )
  }

  const numeros = linhas.map((l) => ({
    quantity: Number(l.quantity.replace(",", ".")) || 0,
    unitCost: Number(l.unitCost.replace(",", ".")) || 0,
  }))
  const total = totalDaCompra(numeros)
  const validas = linhas.filter((l, i) => l.partId && numeros[i].quantity > 0)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="gap-1.5" disabled={pecas.length === 0} />}>
        <Plus className="size-4" />
        {t("nova")}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("novaCompra")}</DialogTitle>
          <DialogDescription>{t("novaAjuda")}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="itens" value={JSON.stringify(
            linhas
              .map((l, i) => ({ partId: l.partId, quantity: numeros[i].quantity, unitCost: numeros[i].unitCost }))
              .filter((l) => l.partId && l.quantity > 0)
          )} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="supplierId">{t("campos.fornecedor")}</Label>
              <select
                id="supplierId"
                name="supplierId"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">{t("campos.semFornecedor")}</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedAt">{t("campos.previsao")}</Label>
              <Input id="expectedAt" name="expectedAt" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("campos.itens")}</Label>
            <div className="space-y-2">
              {linhas.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    value={l.partId}
                    onChange={(e) => escolherPeca(i, e.target.value)}
                    className="flex-1 h-9 rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="">{t("campos.escolhaPeca")}</option>
                    {pecas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.sku ? ` (${p.sku})` : ""}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="w-20"
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => alterar(i, "quantity", e.target.value)}
                    aria-label={t("campos.quantidade")}
                  />
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    placeholder={t("campos.custoUnit")}
                    value={l.unitCost}
                    onChange={(e) => alterar(i, "unitCost", e.target.value)}
                    aria-label={t("campos.custoUnit")}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}
                    disabled={linhas.length === 1}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLinhas((a) => [...a, { partId: "", quantity: "1", unitCost: "" }])}
            >
              <Plus className="size-3.5 mr-1" />
              {t("adicionarItem")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("campos.observacao")}</Label>
            <Input id="notes" name="notes" maxLength={2000} />
          </div>

          <div className="flex justify-between items-center border-t pt-3">
            <span className="text-sm text-muted-foreground">{t("total")}</span>
            <span className="text-lg font-bold tabular-nums">{formatCurrency(total)}</span>
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.semItens")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando || validas.length === 0}>
              {salvando && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("criar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
