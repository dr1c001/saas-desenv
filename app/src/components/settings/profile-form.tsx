"use client"

import { useActionState } from "react"
import { updateProfile, type SettingsFormState } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type UserAddress = {
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  zipCode: string | null
} | null

type User = {
  name: string
  email: string
  role: string
  document: string | null
  phone: string | null
  userAddress: UserAddress
} | null

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
  const addr = user?.userAddress

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
      <div className="space-y-1.5">
        <Label htmlFor="document">CPF / CNPJ</Label>
        <Input id="document" name="document" defaultValue={user?.document ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Telefone</Label>
        <Input id="phone" name="phone" placeholder="(11) 99999-9999" defaultValue={user?.phone ?? ""} />
      </div>

      <p className="text-sm font-medium pt-2">Endereço</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="street">Rua / Avenida</Label>
          <Input id="street" name="street" defaultValue={addr?.street ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="number">Número</Label>
          <Input id="number" name="number" defaultValue={addr?.number ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complement">Complemento</Label>
          <Input id="complement" name="complement" defaultValue={addr?.complement ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="district">Bairro</Label>
          <Input id="district" name="district" defaultValue={addr?.district ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zipCode">CEP</Label>
          <Input id="zipCode" name="zipCode" defaultValue={addr?.zipCode ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" name="city" defaultValue={addr?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">Estado (UF)</Label>
          <Input id="state" name="state" maxLength={2} defaultValue={addr?.state ?? ""} />
        </div>
      </div>

      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  )
}
