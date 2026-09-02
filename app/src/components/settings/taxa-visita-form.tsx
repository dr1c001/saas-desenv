"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarTaxaDeVisita, type EstadoTaxa } from "@/actions/os-orcamento"

// A taxa de visita.
//
// Umas empresas cobram o deslocamento quando o técnico vai, orça e o cliente
// recusa — combustível e duas horas foram gastos. Outras absorvem, porque a
// visita é o custo de vender. O sistema não escolhe: zero é o padrão, e zero
// faz a OS fechar sem valor nenhum.

export function TaxaVisitaForm({ atual }: { atual: number }) {
  const t = useTranslations("taxaDeVisita")
  const [estado, formAction, salvando] = useActionState<EstadoTaxa, FormData>(
    salvarTaxaDeVisita,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("ajuda")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Input
              name="visitFee"
              type="number"
              step="0.01"
              min={0}
              defaultValue={atual || ""}
              placeholder="0,00"
              className="max-w-40"
            />
          </div>
          <Button type="submit" disabled={salvando}>
            {salvando ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            {t("salvar")}
          </Button>
          {estado.ok && <Badge variant="secondary">{t("salvo")}</Badge>}
          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`errors.${estado.erro}` as "errors.semPermissao")}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
