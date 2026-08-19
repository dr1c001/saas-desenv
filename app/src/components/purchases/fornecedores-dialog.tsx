"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plus, Trash2, Truck } from "lucide-react"
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
import { excluirFornecedor, salvarFornecedor, type EstadoCompra } from "@/actions/compras"

type Fornecedor = {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
}

export function FornecedoresDialog({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const t = useTranslations("compras")
  const [aberto, setAberto] = useState(false)
  const [novo, setNovo] = useState(false)
  const [estado, formAction, salvando] = useActionState<EstadoCompra, FormData>(
    salvarFornecedor.bind(null, null),
    {}
  )

  if (estado.ok && novo) setTimeout(() => setNovo(false), 0)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="gap-1.5" />}>
        <Truck className="size-4" />
        {t("fornecedores")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fornecedoresTitulo")}</DialogTitle>
          <DialogDescription>{t("fornecedoresAjuda")}</DialogDescription>
        </DialogHeader>

        {fornecedores.length > 0 && (
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {fornecedores.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[f.document, f.phone, f.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => excluirFornecedor(f.id)}
                  title={t("excluirFornecedor")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {novo ? (
          <form action={formAction} className="space-y-3 border-t pt-3">
            <div className="space-y-2">
              <Label htmlFor="name">{t("campos.nomeFornecedor")}</Label>
              <Input id="name" name="name" required maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="document">{t("campos.documento")}</Label>
                <Input id="document" name="document" maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("campos.telefone")}</Label>
                <Input id="phone" name="phone" maxLength={20} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("campos.email")}</Label>
              <Input id="email" name="email" type="email" maxLength={120} />
            </div>

            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`erros.${estado.erro}` as "erros.semItens")}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNovo(false)}>
                {t("cancelar")}
              </Button>
              <Button type="submit" size="sm" disabled={salvando}>
                {salvando && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                {t("salvar")}
              </Button>
            </div>
          </form>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={() => setNovo(true)} className="gap-1.5">
              <Plus className="size-4" />
              {t("novoFornecedor")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
