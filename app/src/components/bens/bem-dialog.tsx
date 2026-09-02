"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { salvarBem, type EstadoBem } from "@/actions/patrimonio"
import { CATEGORIAS, TAXA_ANUAL, type CategoriaBem } from "@/lib/patrimonio"

export type BemDoFormulario = {
  id: string
  name: string
  category: CategoriaBem
  brand: string | null
  model: string | null
  serialNumber: string | null
  purchaseValue: number
  /** Já no formato do input date (AAAA-MM-DD). */
  purchasedAt: string
  annualRate: string
  residualValue: string
  locationId: string | null
  responsibleId: string | null
  notes: string | null
  status: string
}

// Cadastrar ou editar um bem.
//
// O campo que mais importa e que mais some em cadastro de patrimônio é a DATA
// DA COMPRA: sem ela não há depreciação, e o balanço fica sem base. Por isso
// ela é obrigatória, e o valor também.

export function BemDialog({
  bem,
  locais,
  equipe,
  aberto: abertoExterno,
  onFechar,
}: {
  bem?: BemDoFormulario
  locais: { id: string; name: string }[]
  equipe: { id: string; name: string }[]
  /** Quando controlado de fora (pelo menu de ações da linha). */
  aberto?: boolean
  onFechar?: () => void
}) {
  const t = useTranslations("bens")
  const [abertoInterno, setAbertoInterno] = useState(false)
  const controlado = abertoExterno !== undefined
  const aberto = controlado ? abertoExterno : abertoInterno
  const fechar = () => (controlado ? onFechar?.() : setAbertoInterno(false))

  const [categoria, setCategoria] = useState<CategoriaBem>(bem?.category ?? "OUTRO")
  const [estado, formAction, salvando] = useActionState<EstadoBem, FormData>(
    salvarBem.bind(null, bem?.id ?? null),
    {}
  )

  if (estado.ok && aberto) setTimeout(fechar, 0)

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? setAbertoInterno(true) : fechar())}>
      {/* Sem gatilho quando controlado de fora: dois botões abririam o mesmo
          diálogo e o segundo pareceria não funcionar. */}
      {!controlado && (
        <DialogTrigger
          render={
            <Button size="sm">
              <Plus className="size-4 mr-1.5" />
              {t("novo")}
            </Button>
          }
        />
      )}

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{bem ? t("editar") : t("novo")}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("nome")}</Label>
            <Input id="name" name="name" required maxLength={160} defaultValue={bem?.name} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">{t("categoria")}</Label>
              <select
                id="category"
                name="category"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaBem)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {t(`categorias.${c}` as "categorias.OUTRO")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="annualRate">{t("taxa")}</Label>
              <Input
                id="annualRate"
                name="annualRate"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={bem?.annualRate}
                placeholder={String(TAXA_ANUAL[categoria])}
              />
              {/* O placeholder MOSTRA a taxa da categoria escolhida, e muda com
                  ela: sem isso o campo vazio não diz o que vai acontecer. */}
              <p className="text-[11px] text-muted-foreground">{t("taxaAjuda")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="purchaseValue">{t("valor")}</Label>
              <Input
                id="purchaseValue"
                name="purchaseValue"
                inputMode="decimal"
                required
                defaultValue={bem ? String(bem.purchaseValue) : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchasedAt">{t("dataCompra")}</Label>
              <Input
                id="purchasedAt"
                name="purchasedAt"
                type="date"
                required
                defaultValue={bem?.purchasedAt}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand">{t("marca")}</Label>
              <Input id="brand" name="brand" maxLength={80} defaultValue={bem?.brand ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">{t("modelo")}</Label>
              <Input id="model" name="model" maxLength={80} defaultValue={bem?.model ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serialNumber">{t("serie")}</Label>
              <Input
                id="serialNumber"
                name="serialNumber"
                maxLength={80}
                defaultValue={bem?.serialNumber ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Os locais só existem com o recurso de estoque. Sem eles o campo
                some, e o "com quem está" continua respondido pelo responsável. */}
            {locais.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="locationId">{t("local")}</Label>
                <select
                  id="locationId"
                  name="locationId"
                  defaultValue={bem?.locationId ?? ""}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">{t("semLocal")}</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="responsibleId">{t("responsavel")}</Label>
              <select
                id="responsibleId"
                name="responsibleId"
                defaultValue={bem?.responsibleId ?? ""}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">{t("semResponsavel")}</option>
                {equipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="residualValue">{t("residual")}</Label>
            <Input
              id="residualValue"
              name="residualValue"
              inputMode="decimal"
              defaultValue={bem?.residualValue}
              className="max-w-40"
            />
            <p className="text-[11px] text-muted-foreground">{t("residualAjuda")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("observacoes")}</Label>
            <Input id="notes" name="notes" maxLength={2000} defaultValue={bem?.notes ?? ""} />
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.semPermissao")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t("salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
