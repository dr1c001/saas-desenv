"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Pencil } from "lucide-react"
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
import { salvarPrecos, type EstadoCotacao } from "@/actions/cotacao"

// Lançar o que UM fornecedor respondeu.
//
// A resposta chega por telefone, e-mail ou WhatsApp — quem digita é a empresa,
// não o fornecedor. Por isso a tela é de digitação rápida: um campo por item,
// na mesma ordem da comparação.
//
// CAMPO VAZIO APAGA o preço, e não grava zero. "Não tenho essa peça" e "é de
// graça" são coisas diferentes: zero venceria a comparação e faria o sistema
// recomendar quem não tem o produto.

export function PrecosDialog({
  participantId,
  nome,
  itens,
  observacoes,
}: {
  participantId: string
  nome: string
  itens: { id: string; nome: string; quantidade: number; atual: string }[]
  observacoes: string
}) {
  const t = useTranslations("cotacoes")
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, salvando] = useActionState<EstadoCotacao, FormData>(
    salvarPrecos.bind(null, participantId),
    {}
  )

  if (estado.ok && aberto) setTimeout(() => setAberto(false), 0)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Pencil className="size-3.5 mr-1.5" />
            {t("lancarPrecos")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("lancarPrecos")}</DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="max-h-[60vh] space-y-3 overflow-y-auto">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center gap-3">
              <Label htmlFor={`preco_${i.id}`} className="min-w-0 flex-1 text-sm font-normal">
                {i.nome}
                <span className="block text-xs text-muted-foreground">
                  {t("quantidade")}: {i.quantidade}
                </span>
              </Label>
              <Input
                id={`preco_${i.id}`}
                name={`preco_${i.id}`}
                type="number"
                step="0.01"
                min={0}
                defaultValue={i.atual}
                placeholder={t("naoCotou")}
                className="w-32"
              />
            </div>
          ))}

          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="notes">{t("observacoes")}</Label>
            <Input id="notes" name="notes" defaultValue={observacoes} maxLength={500} />
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.semPermissao")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
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
