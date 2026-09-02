"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { salvarBasesDoBalanco, type EstadoBalanco } from "@/actions/balanco"

// Os dois números que o sistema não tem como calcular sozinho.
//
// O caixa inicial é o defeito mais comum de todos: sem ele o sistema só conhece
// o MOVIMENTO desde que a empresa começou a usá-lo, e uma empresa que já
// existia aparece com caixa negativo no primeiro mês em que paga mais do que
// recebe. Por isso o formulário fica em cima, e não escondido em Configurações.

export function BasesForm({
  caixaInicial,
  capitalSocial,
}: {
  caixaInicial: number | null
  capitalSocial: number | null
}) {
  const t = useTranslations("balanco.bases")
  const tErros = useTranslations("balanco.erros")
  const [estado, formAction, salvando] = useActionState<EstadoBalanco, FormData>(
    salvarBasesDoBalanco,
    {}
  )

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <h2 className="text-sm font-semibold">{t("titulo")}</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("ajuda")}</p>
        </div>

        <form action={formAction} className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="openingCash">{t("caixaInicial")}</Label>
            <Input
              id="openingCash"
              name="openingCash"
              inputMode="decimal"
              className="w-44"
              // `?? ""` e não `|| ""`: zero informado é escolha legítima, e
              // com `||` o campo apareceria vazio como se ninguém tivesse
              // preenchido — que é justamente a distinção que o conferente usa.
              defaultValue={caixaInicial ?? ""}
            />
            <p className="max-w-56 text-[11px] text-muted-foreground">{t("caixaInicialAjuda")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shareCapital">{t("capitalSocial")}</Label>
            <Input
              id="shareCapital"
              name="shareCapital"
              inputMode="decimal"
              className="w-44"
              defaultValue={capitalSocial ?? ""}
            />
            <p className="max-w-56 text-[11px] text-muted-foreground">{t("capitalSocialAjuda")}</p>
          </div>

          <div className="flex items-center gap-2 pb-6">
            <Button type="submit" size="sm" disabled={salvando}>
              {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t("salvar")}
            </Button>
            {estado.ok && !salvando && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" />
              </span>
            )}
          </div>
        </form>

        <p className="text-[11px] text-muted-foreground">{t("vazioApaga")}</p>

        {estado.erro && (
          <p className="text-sm text-destructive">
            {tErros(estado.erro as "valorInvalido")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
