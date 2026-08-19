"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowDownUp, Loader2 } from "lucide-react"
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
import { movimentar, type EstadoMovimento } from "@/actions/estoque"
import { saldoApos, type TipoMovimento } from "@/lib/estoque"

const TIPOS: TipoMovimento[] = ["ENTRADA", "SAIDA", "AJUSTE"]

export function MovimentoDialog({
  partId,
  nome,
  unidade,
  saldo,
}: {
  partId: string
  nome: string
  unidade: string
  saldo: number
}) {
  const t = useTranslations("estoque")
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoMovimento>("ENTRADA")
  const [quantidade, setQuantidade] = useState("")
  const [estado, formAction, salvando] = useActionState<EstadoMovimento, FormData>(movimentar, {})

  if (estado.ok && aberto) setTimeout(() => setAberto(false), 0)

  const qtd = Number(quantidade.replace(",", "."))
  // Mostra o saldo resultante ANTES de confirmar. É o que evita o erro mais
  // comum do ajuste: somar quando se queria definir.
  const previsto = Number.isFinite(qtd) && quantidade.trim() ? saldoApos(saldo, tipo, qtd) : null

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
        <ArrowDownUp className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("movimentar")}</DialogTitle>
          <DialogDescription>
            {nome} · {t("saldoAtual", { saldo, unidade })}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="partId" value={partId} />

          <div className="space-y-2">
            <Label>{t("campos.tipo")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setTipo(x)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                    tipo === x ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  {t(`tipos.${x}` as "tipos.ENTRADA")}
                </button>
              ))}
            </div>
            <input type="hidden" name="tipo" value={tipo} />
            <p className="text-xs text-muted-foreground">
              {t(`tiposAjuda.${tipo}` as "tiposAjuda.ENTRADA")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantidade">
              {tipo === "AJUSTE" ? t("campos.contado") : t("campos.quantidade")}
            </Label>
            <Input
              id="quantidade"
              name="quantidade"
              inputMode="decimal"
              required
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            {previsto !== null && (
              <p className="text-xs text-muted-foreground">
                {t("saldoFicara", { saldo: previsto, unidade })}
                {previsto < 0 && ` — ${t("ficaraNegativo")}`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">
              {t("campos.motivo")}
              {tipo === "AJUSTE" && " *"}
            </Label>
            <Input
              id="motivo"
              name="motivo"
              maxLength={200}
              required={tipo === "AJUSTE"}
              placeholder={t("campos.motivoExemplo")}
            />
            {tipo === "AJUSTE" && (
              <p className="text-xs text-muted-foreground">{t("campos.motivoAjuda")}</p>
            )}
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
              {salvando && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("confirmar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
