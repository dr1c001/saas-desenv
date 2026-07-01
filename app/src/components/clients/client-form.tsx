"use client"

import { useActionState } from "react"
import { createClient, updateClient, type ClientFormState } from "@/actions/clients"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

type Client = {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  status: string
  address?: {
    street: string | null
    number: string | null
    complement: string | null
    district: string | null
    city: string | null
    state: string | null
    zipCode: string | null
  } | null
}

type Props = { client?: Client }

export function ClientForm({ client }: Props) {
  const action = client
    ? updateClient.bind(null, client.id)
    : createClient

  const [state, formAction, isPending] = useActionState<ClientFormState, FormData>(
    action,
    {}
  )

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" defaultValue={client?.name} required />
            {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="document">CPF / CNPJ</Label>
            <Input id="document" name="document" defaultValue={client?.document ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" name="whatsapp" placeholder="(11) 99999-9999" defaultValue={(client as { whatsapp?: string | null })?.whatsapp ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
            {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={client?.status ?? "ACTIVE"}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="INACTIVE">Inativo</SelectItem>
                <SelectItem value="DEFAULTER">Inadimplente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zipCode">CEP</Label>
            <Input id="zipCode" name="zipCode" defaultValue={client?.address?.zipCode ?? ""} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="street">Rua</Label>
            <Input id="street" name="street" defaultValue={client?.address?.street ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="number">Número</Label>
            <Input id="number" name="number" defaultValue={client?.address?.number ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complement">Complemento</Label>
            <Input id="complement" name="complement" defaultValue={client?.address?.complement ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="district">Bairro</Label>
            <Input id="district" name="district" defaultValue={client?.address?.district ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" name="city" defaultValue={client?.address?.city ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">Estado</Label>
            <Input id="state" name="state" maxLength={2} defaultValue={client?.address?.state ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : client ? "Salvar alterações" : "Criar cliente"}
        </Button>
        <Link href="/clients" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
