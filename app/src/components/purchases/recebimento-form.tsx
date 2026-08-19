"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { receberCompra, type EstadoCompra } from "@/actions/compras"
import { faltaReceber } from "@/lib/compras"

type Item = {
  id: string
  nome: string
  unidade: string
  pedido: number
  recebido: number
}

export function RecebimentoForm({ compraId, itens }: { compraId: string; itens: Item[] }) {
  const t = useTranslations("compras")
  const [estado, formAction, salvando] = useActionState<EstadoCompra, FormData>(
    receberCompra.bind(null, compraId),
    {}
  )

  // Começa preenchido com o que falta: no caso normal a entrega vem completa,
  // e obrigar a digitar item por item faria a pessoa não registrar.
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      itens.map((i) => [i.id, String(faltaReceber({ pedido: i.pedido, recebido: i.recebido }) || "")])
    )
  )

  const pendentes = itens.filter((i) => faltaReceber({ pedido: i.pedido, recebido: i.recebido }) > 0)
  if (pendentes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("tudoRecebido")}</p>
  }

  return (
    <form action={formAction} className="space-y-3">
      {pendentes.map((i) => {
        const falta = faltaReceber({ pedido: i.pedido, recebido: i.recebido })
        return (
          <div key={i.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{i.nome}</p>
              <p className="text-xs text-muted-foreground">
                {t("faltamUnidades", { qtd: falta, unidade: i.unidade })}
              </p>
            </div>
            <Input
              name={`recebido_${i.id}`}
              inputMode="decimal"
              className="w-24 shrink-0"
              value={valores[i.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [i.id]: e.target.value }))}
              aria-label={t("colunas.recebido")}
            />
          </div>
        )
      })}

      {estado.erro && (
        <p className="text-sm text-destructive">
          {t(`erros.${estado.erro}` as "erros.semItens")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t("receberAviso")}</p>

      <Button type="submit" disabled={salvando} className="gap-1.5">
        {salvando ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
        {t("confirmarRecebimento")}
      </Button>
    </form>
  )
}
