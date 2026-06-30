"use client"

import { useState, useTransition } from "react"
import { savePermissions } from "@/actions/permissions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"

type Perm = { tab: string; label: string; allowed: boolean }

export function PermissionsForm({ permissions }: { permissions: Perm[] }) {
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
          {perms.map((perm) => (
            <div
              key={perm.tab}
              className="flex items-center justify-between py-3 border-b last:border-0"
            >
              <Label htmlFor={perm.tab} className="text-sm font-medium cursor-pointer">
                {perm.label}
              </Label>
              <input
                type="checkbox"
                id={perm.tab}
                checked={perm.allowed}
                onChange={() => toggle(perm.tab)}
                className="size-4 accent-primary cursor-pointer"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar permissões"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" />
            Salvo com sucesso
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        As alterações de permissão entram em vigor na próxima vez que o técnico carregar a página.
      </p>
    </div>
  )
}
