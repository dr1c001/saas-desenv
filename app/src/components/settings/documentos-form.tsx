"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarDocumentos, type EstadoDocumentos } from "@/actions/documentos"
import { SUGESTOES_DIAS } from "@/lib/garantia"

export function DocumentosForm({
  orderTerms,
  quoteTerms,
  warrantyDays,
}: {
  orderTerms: string | null
  quoteTerms: string | null
  warrantyDays: number | null
}) {
  const t = useTranslations("documentos")
  const [estado, formAction, salvando] = useActionState<EstadoDocumentos, FormData>(
    salvarDocumentos,
    {}
  )
  const [dias, setDias] = useState<string>(warrantyDays === null ? "" : String(warrantyDays))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="warrantyDays">{t("warranty.label")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="warrantyDays"
                name="warrantyDays"
                type="number"
                min={0}
                max={3650}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                placeholder={t("warranty.placeholder")}
                className="w-32"
              />
              {/* Atalhos pros prazos que a maioria dos ramos usa — digitar 365
                  pra dizer "um ano" é o tipo de atrito que faz não configurar. */}
              {SUGESTOES_DIAS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDias(String(d))}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    dias === String(d) ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  {t(`warranty.presets.${d}` as "warranty.presets.0")}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("warranty.hint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderTerms">{t("orderTerms.label")}</Label>
            <Textarea
              id="orderTerms"
              name="orderTerms"
              rows={5}
              maxLength={4000}
              defaultValue={orderTerms ?? ""}
              placeholder={t("orderTerms.placeholder")}
            />
            <p className="text-xs text-muted-foreground">{t("orderTerms.hint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quoteTerms">{t("quoteTerms.label")}</Label>
            <Textarea
              id="quoteTerms"
              name="quoteTerms"
              rows={5}
              maxLength={4000}
              defaultValue={quoteTerms ?? ""}
              placeholder={t("quoteTerms.placeholder")}
            />
            <p className="text-xs text-muted-foreground">{t("quoteTerms.hint")}</p>
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            {t("legalNotice")}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {t("save")}
            </Button>
            {estado.ok && <Badge variant="secondary">{t("saved")}</Badge>}
            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`errors.${estado.erro}` as "errors.semPermissao")}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
