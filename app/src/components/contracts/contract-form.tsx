"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plus, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarContrato, type EstadoContrato } from "@/actions/contracts"
import { FREQUENCIAS, type Frequencia } from "@/lib/contrato-recorrente"

type Opcao = { id: string; name: string }

export function ContractForm({
  clientes,
  tecnicos,
}: {
  clientes: Opcao[]
  tecnicos: Opcao[]
}) {
  const t = useTranslations("contratos")
  const [aberto, setAberto] = useState(false)
  const [frequencia, setFrequencia] = useState<Frequencia>("MONTHLY")
  const [estado, formAction, salvando] = useActionState<EstadoContrato, FormData>(
    salvarContrato,
    {}
  )

  // Só as frequências mensais ou maiores usam dia do mês; nas semanais o dia
  // vem da própria data de início, e mostrar o campo confundiria.
  const usaDiaDoMes = !["WEEKLY", "BIWEEKLY"].includes(frequencia)

  if (!aberto) {
    return (
      <Button type="button" onClick={() => setAberto(true)} disabled={clientes.length === 0}>
        <Plus className="size-4 mr-2" />
        {t("newButton")}
      </Button>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("formTitle")}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">{t("fields.client")}</Label>
              <select id="clientId" name="clientId" required className={select}>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t("fields.title")}</Label>
              <Input id="title" name="title" required maxLength={120}
                placeholder={t("fields.titlePlaceholder")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">{t("fields.frequency")}</Label>
              <select
                id="frequency" name="frequency" value={frequencia}
                onChange={(e) => setFrequencia(e.target.value as Frequencia)}
                className={select}
              >
                {FREQUENCIAS.map((f) => (
                  <option key={f} value={f}>{t(`frequencies.${f}` as "frequencies.WEEKLY")}</option>
                ))}
              </select>
            </div>

            {usaDiaDoMes && (
              <div className="space-y-2">
                <Label htmlFor="dayOfMonth">{t("fields.dayOfMonth")}</Label>
                <Input id="dayOfMonth" name="dayOfMonth" type="number" min={1} max={31} defaultValue={1} />
                <p className="text-xs text-muted-foreground">{t("fields.dayOfMonthHint")}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">{t("fields.amount")}</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min={0} defaultValue={0} />
              <p className="text-xs text-muted-foreground">{t("fields.amountHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="technicianId">{t("fields.technician")}</Label>
              <select id="technicianId" name="technicianId" className={select}>
                <option value="">{t("fields.noTechnician")}</option>
                {tecnicos.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startsAt">{t("fields.startsAt")}</Label>
              <Input id="startsAt" name="startsAt" type="date" required
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endsAt">{t("fields.endsAt")}</Label>
              <Input id="endsAt" name="endsAt" type="date" />
              <p className="text-xs text-muted-foreground">{t("fields.endsAtHint")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("fields.description")}</Label>
            <Textarea id="description" name="description" rows={2} maxLength={500} />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {t("save")}
            </Button>
            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`errors.${estado.erro}` as "errors.dadosInvalidos")}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const select =
  "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
