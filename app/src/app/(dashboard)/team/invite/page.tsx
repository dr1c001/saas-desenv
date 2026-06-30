"use client"

import { useActionState } from "react"
import { inviteTeamMember, type TeamFormState } from "@/actions/team"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

export default function InvitePage() {
  const [state, action, isPending] = useActionState<TeamFormState, FormData>(inviteTeamMember, {})

  if (state.success) {
    return (
      <div className="max-w-md space-y-4">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-12 text-green-600" />
          <h2 className="text-xl font-bold">Convite enviado!</h2>
          <p className="text-muted-foreground text-sm">{state.message}</p>
          <div className="flex gap-2">
            <Link href="/team" className={buttonVariants()}>Ver equipe</Link>
            <Link href="/team/invite" className={buttonVariants({ variant: "outline" })}>Convidar outro</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Convidar membro</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do novo membro</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" name="name" placeholder="João Silva" />
              {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" placeholder="joao@empresa.com" />
              {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Função</Label>
              <Select name="role" defaultValue="TECHNICIAN">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador (acesso total)</SelectItem>
                  <SelectItem value="TECHNICIAN">Técnico (acesso controlado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="document">CPF / CNPJ</Label>
              <Input id="document" name="document" placeholder="000.000.000-00" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" placeholder="(11) 99999-9999" />
            </div>

            <p className="text-sm font-medium pt-1">Endereço</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="street">Rua / Avenida</Label>
                <Input id="street" name="street" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="number">Número</Label>
                <Input id="number" name="number" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" name="complement" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="district">Bairro</Label>
                <Input id="district" name="district" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zipCode">CEP</Label>
                <Input id="zipCode" name="zipCode" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" name="city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">Estado (UF)</Label>
                <Input id="state" name="state" maxLength={2} />
              </div>
            </div>

            {state.message && !state.success && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Enviando..." : "Enviar convite"}
              </Button>
              <Link href="/team" className={buttonVariants({ variant: "outline" })}>
                Cancelar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
