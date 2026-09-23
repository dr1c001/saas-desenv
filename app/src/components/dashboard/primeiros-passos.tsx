"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronRight, Loader2, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { dispensarPrimeirosPassos } from "@/actions/primeiros-passos"
import type { PrimeirosPassos } from "@/lib/primeiros-passos"

/**
 * Painel de primeiros passos, no topo do dashboard.
 *
 * O passo pendente MAIS PRÓXIMO fica destacado e é o único com botão; os
 * outros ficam listados apagados. É de propósito: seis botões competindo
 * viram uma lista de tarefas, e lista de tarefas se ignora. Um convite por
 * vez é o que a pessoa consegue atender entre um cliente e outro.
 */
export function PainelPrimeirosPassos({ dados }: { dados: PrimeirosPassos }) {
  const t = useTranslations("primeirosPassos")
  const [pendente, startTransition] = useTransition()

  if (!dados.visivel) return null

  const proximo = dados.passos.find((p) => p.chave === dados.proximo)
  const pct = Math.round((dados.concluidos / dados.total) * 100)

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => startTransition(() => dispensarPrimeirosPassos())}
            disabled={pendente}
            title={t("dismiss")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {pendente ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("progress", { feitos: dados.concluidos, total: dados.total })}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {proximo && (
          <Link
            href={proximo.href}
            className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium">
                {t(`passos.${proximo.chave}.titulo` as "passos.logo.titulo")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`passos.${proximo.chave}.porque` as "passos.logo.porque")}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}

        <ul className="space-y-1">
          {dados.passos
            .filter((p) => p.chave !== dados.proximo)
            .map((p) => (
              <li key={p.chave} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
                    p.feito ? "bg-green-600 text-white" : "border border-muted-foreground/40"
                  }`}
                >
                  {p.feito && <Check className="size-2.5" />}
                </span>
                <span className={p.feito ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                  {t(`passos.${p.chave}.titulo` as "passos.logo.titulo")}
                </span>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  )
}
