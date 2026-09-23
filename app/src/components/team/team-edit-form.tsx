"use client"

import { useActionState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { atualizarIntegrante, type TeamFormState } from "@/actions/team"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2 } from "lucide-react"
import { CARGOS_ATRIBUIVEIS } from "@/lib/cargos"

type Endereco = {
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  zipCode: string | null
}

export type IntegranteParaEditar = {
  id: string
  name: string
  email: string
  role: string
  document: string | null
  phone: string | null
  userAddress: Endereco | null
}

type Props = {
  membro: IntegranteParaEditar
  /** "owner" ou "self" quando o cargo não pode ser mexido; null quando pode. */
  cargoTravado: "owner" | "self" | null
}

export function TeamEditForm({ membro, cargoTravado }: Props) {
  const [state, action, isPending] = useActionState<TeamFormState, FormData>(
    atualizarIntegrante,
    {}
  )
  const t = useTranslations("team.edit")
  const tc = useTranslations("common")
  // Os rótulos dos campos são os MESMOS da tela de convite: é o mesmo cadastro,
  // e duas listas de rótulos acabariam divergindo.
  const tf = useTranslations("team.invite.form")
  const end = membro.userAddress

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="memberId" value={membro.id} />

          <div className="space-y-1.5">
            <Label htmlFor="name">{tf("nameLabel")}</Label>
            <Input id="name" name="name" defaultValue={membro.name} />
            {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{tf("emailLabel")}</Label>
            <Input id="email" value={membro.email} disabled readOnly />
            <p className="text-xs text-muted-foreground">{t("emailLocked")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">{tf("roleLabel")}</Label>
            <Select name="role" defaultValue={membro.role} disabled={cargoTravado !== null}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARGOS_ATRIBUIVEIS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {tc(`roles.${c}` as "roles.ADMIN")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Um <Select> desligado não envia nada — e é isso que se quer:
                a Action trata cargo ausente como "mantenha o atual". O hidden
                que havia aqui mandava o valor de volta, e para o PROPRIETÁRIO
                esse valor é "OWNER", que `CARGOS_ATRIBUIVEIS` recusa: o zod
                derrubava o formulário inteiro e corrigir o telefone do dono
                não gravava nada nem dizia nada.
                (Achado na revisão pré-deploy de 23/09/2026.) */}
            {cargoTravado === "owner" && (
              <p className="text-xs text-muted-foreground">{t("ownerLocked")}</p>
            )}
            {cargoTravado === "self" && (
              <p className="text-xs text-muted-foreground">{t("selfLocked")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="document">{tf("documentLabel")}</Label>
            <Input id="document" name="document" defaultValue={membro.document ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{tf("phoneLabel")}</Label>
            <Input id="phone" name="phone" defaultValue={membro.phone ?? ""} />
          </div>

          <p className="text-sm font-medium pt-1">{tf("addressTitle")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="street">{tf("streetLabel")}</Label>
              <Input id="street" name="street" defaultValue={end?.street ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="number">{tf("numberLabel")}</Label>
              <Input id="number" name="number" defaultValue={end?.number ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complement">{tf("complementLabel")}</Label>
              <Input id="complement" name="complement" defaultValue={end?.complement ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="district">{tf("districtLabel")}</Label>
              <Input id="district" name="district" defaultValue={end?.district ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zipCode">{tf("zipCodeLabel")}</Label>
              <Input id="zipCode" name="zipCode" defaultValue={end?.zipCode ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">{tf("cityLabel")}</Label>
              <Input id="city" name="city" defaultValue={end?.city ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">{tf("stateLabel")}</Label>
              <Input id="state" name="state" maxLength={2} defaultValue={end?.state ?? ""} />
            </div>
          </div>

          {/* QUALQUER erro de campo aparece, e não só o do nome. Um erro num
              campo sem linha de erro própria é um formulário que não salva e
              não explica — foi assim que o cargo do dono falhou calado. */}
          {state.errors &&
            Object.entries(state.errors)
              .filter(([campo]) => campo !== "name")
              .map(([campo, msgs]) => (
                <p key={campo} className="text-sm text-destructive">
                  {msgs[0]}
                </p>
              ))}

          {state.message && (
            <p
              className={`text-sm flex items-center gap-1.5 ${
                state.success ? "text-green-700" : "text-destructive"
              }`}
            >
              {state.success && <CheckCircle2 className="size-4" />}
              {state.message}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? t("submitting") : t("submit")}
            </Button>
            <Link href="/team" className={buttonVariants({ variant: "outline" })}>
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
