"use client"

import { useActionState } from "react"
import { updateTenant, type SettingsFormState } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Tenant = { name: string; document: string | null } | null

export function TenantForm({ tenant }: { tenant: Tenant }) {
  const [state, formAction, isPending] = useActionState<SettingsFormState, FormData>(
    updateTenant,
    {}
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome da empresa *</Label>
        <Input id="name" name="name" defaultValue={tenant?.name ?? ""} required />
        {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="document">CNPJ / CPF</Label>
        <Input id="document" name="document" defaultValue={tenant?.document ?? ""} />
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  )
}
