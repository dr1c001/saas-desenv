"use client"

import { useActionState } from "react"
import { updateProfile, type SettingsFormState } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type User = { name: string; email: string; role: string } | null

const roleLabel: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  TECHNICIAN: "Técnico",
}

export function ProfileForm({ user }: { user: User }) {
  const [state, formAction, isPending] = useActionState<SettingsFormState, FormData>(
    updateProfile,
    {}
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Seu nome *</Label>
        <Input id="name" name="name" defaultValue={user?.name ?? ""} required />
        {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input value={user?.email ?? ""} disabled className="opacity-60" readOnly />
        <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado aqui.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Perfil</Label>
        <Input value={roleLabel[user?.role ?? ""] ?? user?.role ?? ""} disabled className="opacity-60" readOnly />
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  )
}
