"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { savePermissions } from "@/actions/permissions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"

type Perm = { tab: string; label: string; allowed: boolean }

// O slug da aba (kebab-case, vindo de ALL_TABS/TabPermission) não bate com a
// chave de tradução do menu lateral (camelCase, em nav.*). Mapeia aqui pra
// reaproveitar exatamente os mesmos rótulos da sidebar em vez de traduzir os
// nomes das abas uma segunda vez.
const NAV_KEY_BY_TAB: Record<string, string> = {
  dashboard: "dashboard",
  clients: "clients",
  "service-orders": "serviceOrders",
  history: "history",
  maintenance: "maintenance",
  providers: "providers",
  receipts: "receipts",
  schedule: "schedule",
  finance: "finance",
  reports: "reports",
  team: "team",
  map: "map",
  quotes: "quotes",
  billing: "billing",
  fiscal: "fiscal",
  referral: "referral",
}

export function PermissionsForm({ permissions }: { permissions: Perm[] }) {
  const t = useTranslations("settingsAdvanced.permissions")
  const tCommon = useTranslations("common")
  const tNav = useTranslations("nav")
  const [perms, setPerms] = useState(permissions)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggle(tab: string) {
    setPerms((p) => p.map((x) => (x.tab === tab ? { ...x, allowed: !x.allowed } : x)))
    setSaved(false)
  }

  function handleSave() {
    const allowed = perms.filter((p) => p.allowed).map((p) => p.tab)
    startTransition(async () => {
      await savePermissions(allowed)
      setSaved(true)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-1">
          {perms.map((perm) => {
            // Aba nova ainda sem chave em nav.* cai no label vindo do servidor,
            // pra não quebrar a tela com erro de mensagem faltando.
            const navKey = NAV_KEY_BY_TAB[perm.tab]
            return (
              <div
                key={perm.tab}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <Label htmlFor={perm.tab} className="text-sm font-medium cursor-pointer">
                  {navKey ? tNav(navKey as "dashboard") : perm.label}
                </Label>
                <input
                  type="checkbox"
                  id={perm.tab}
                  checked={perm.allowed}
                  onChange={() => toggle(perm.tab)}
                  className="size-4 accent-primary cursor-pointer"
                />
              </div>
            )
          })}
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

      <p className="text-xs text-muted-foreground">
        {t("effectNote")}
      </p>
    </div>
  )
}
