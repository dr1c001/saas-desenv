"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { receberCompra, type EstadoCompra } from "@/actions/compras"
import { faltaReceber } from "@/lib/compras"

type Item = {
  id: string
  nome: string
  unidade: string
  pedido: number
  recebido: number
  /** Custo unitário já gravado. Zero = a ordem nasceu sem preço. */
  custo: number
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
              {/* ─── O preço que faltava ─────────────────────────────────
                  A ordem gerada por "Comprar o que falta" nasce com o último
                  custo conhecido da peça, e peça nunca comprada não tem custo:
                  a linha vinha R$ 0,00. Receber assim derrubava o custo médio
                  E não criava despesa nenhuma — a peça entrava no estoque e o
                  dinheiro não saía do caixa.

                  O campo só aparece na linha zerada, que é onde não há preço
                  nenhum a perder, e é aqui que a nota do fornecedor está na
                  mão. */}
              {i.custo <= 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("semCusto")}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {i.custo <= 0 && (
                <Input
                  name={`custo_${i.id}`}
                  inputMode="decimal"
                  required
                  className="w-28"
                  placeholder={t("campos.custoUnit")}
                  aria-label={t("campos.custoUnit")}
                />
              )}
              <Input
                name={`recebido_${i.id}`}
                inputMode="decimal"
                className="w-24"
                value={valores[i.id] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [i.id]: e.target.value }))}
                aria-label={t("colunas.recebido")}
              />
            </div>
          </div>
        )
      })}

      {estado.erro && (
        <p className="text-sm text-destructive">
          {t(`erros.${estado.erro}` as "erros.semItens")}
        </p>
      )}

      {/* ─── Como isso vai ser PAGO ────────────────────────────────────
          O recebimento é o momento em que se sabe o que foi combinado com o
          fornecedor — e é aqui que a compra vira despesa no Financeiro. Sem
          preencher, vence hoje em uma parcela: o comportamento de quem paga
          à vista, que é o caso mais comum. */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="primeiroVencimento" className="text-xs">
            {t("primeiroVencimento")}
          </Label>
          <Input id="primeiroVencimento" name="primeiroVencimento" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parcelas" className="text-xs">
            {t("parcelas")}
          </Label>
          <Input
            id="parcelas"
            name="parcelas"
            type="number"
            min={1}
            max={36}
            defaultValue={1}
          />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">{t("pagamentoAjuda")}</p>
      </div>

      <p className="text-xs text-muted-foreground">{t("receberAviso")}</p>

      <Button type="submit" disabled={salvando} className="gap-1.5">
        {salvando ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
        {t("confirmarRecebimento")}
      </Button>
    </form>
  )
}
