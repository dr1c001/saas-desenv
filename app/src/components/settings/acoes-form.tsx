"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { saveAcoes } from "@/actions/permissions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"
import type { Acao } from "@/lib/acoes"

type Perm = { acao: Acao; allowed: boolean }

/**
 * O que o técnico pode FAZER, um degrau abaixo de quais abas ele enxerga.
 *
 * A lista vem de lib/acoes.ts, que é puro — importar de um módulo que fala com
 * o Prisma arrastaria o driver do Postgres para o navegador e o build quebraria
 * com "Can't resolve 'dns'", que não diz nada sobre a causa.
 */
export function AcoesForm({ cargo, acoes }: { cargo: string; acoes: Perm[] }) {
  const t = useTranslations("settingsAdvanced.permissions.acoes")
  const tCommon = useTranslations("common")
  const [perms, setPerms] = useState(acoes)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggle(acao: Acao) {
    setPerms((p) => p.map((x) => (x.acao === acao ? { ...x, allowed: !x.allowed } : x)))
    setSaved(false)
  }

  function handleSave() {
    const permitidas = perms.filter((p) => p.allowed).map((p) => p.acao)
    startTransition(async () => {
      await saveAcoes(cargo, permitidas)
      setSaved(true)
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-1">
          {perms.map((perm) => (
            <div
              key={perm.acao}
              className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
            >
              <Label htmlFor={perm.acao} className="text-sm font-medium cursor-pointer">
                {t(`labels.${perm.acao}` as "labels.os.criar")}
              </Label>
              <input
                type="checkbox"
                id={perm.acao}
                checked={perm.allowed}
                onChange={() => toggle(perm.acao)}
                className="size-4 shrink-0 accent-primary cursor-pointer"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? tCommon("saving") : t("saveButton")}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" />
            {t("savedMessage")}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("effectNote")}</p>
    </div>
  )
}
