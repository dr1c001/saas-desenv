"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  createCustomField,
  deleteCustomField,
  moveCustomField,
  type EstadoCampo,
} from "@/actions/custom-fields"
import { TIPOS_CAMPO, MAX_CAMPOS_POR_ENTIDADE, type DefinicaoCampo } from "@/lib/custom-fields"

type Entidade = "CLIENT" | "SERVICE_ORDER"

export function CustomFieldsManager({
  entity,
  campos,
}: {
  entity: Entidade
  campos: DefinicaoCampo[]
}) {
  const t = useTranslations("customFields")
  const [estado, formAction, salvando] = useActionState<EstadoCampo, FormData>(
    createCustomField,
    {}
  )
  const [tipo, setTipo] = useState("TEXT")
  const [mexendo, startTransition] = useTransition()

  const cheio = campos.length >= MAX_CAMPOS_POR_ENTIDADE

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(`entities.${entity}` as "entities.CLIENT")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campos.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("emptyState")}</p>
          ) : (
            <ul className="divide-y">
              {campos.map((campo, i) => (
                <li key={campo.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {campo.label}
                      {campo.required && <span className="text-destructive ml-0.5">*</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`types.${campo.type}` as "types.TEXT")}
                      {campo.type === "SELECT" && ` — ${campo.options.join(", ")}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === 0 || mexendo}
                      aria-label={t("moveUp")}
                      onClick={() => startTransition(() => { moveCustomField(campo.id, "up") })}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === campos.length - 1 || mexendo}
                      aria-label={t("moveDown")}
                      onClick={() => startTransition(() => { moveCustomField(campo.id, "down") })}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={mexendo}
                      aria-label={t("remove")}
                      // Confirmação porque some da tela de todo mundo de uma
                      // vez. Os valores já preenchidos não são apagados do
                      // banco — recriar o campo traz tudo de volta.
                      onClick={() => {
                        if (confirm(t("confirmRemove", { campo: campo.label }))) {
                          startTransition(() => { deleteCustomField(campo.id) })
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {cheio ? (
            <p className="text-sm text-muted-foreground">
              {t("limitReached", { max: MAX_CAMPOS_POR_ENTIDADE })}
            </p>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="entity" value={entity} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`label-${entity}`}>{t("fieldLabel")}</Label>
                  <Input
                    id={`label-${entity}`}
                    name="label"
                    required
                    maxLength={40}
                    placeholder={t("fieldLabelPlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`type-${entity}`}>{t("fieldType")}</Label>
                  <select
                    id={`type-${entity}`}
                    name="type"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    {TIPOS_CAMPO.map((tp) => (
                      <option key={tp} value={tp}>
                        {t(`types.${tp}` as "types.TEXT")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Só faz sentido para lista fechada, e mostrar sempre confundiria
                  quem está criando um campo de texto simples. */}
              {tipo === "SELECT" && (
                <div className="space-y-2">
                  <Label htmlFor={`options-${entity}`}>{t("fieldOptions")}</Label>
                  <Textarea
                    id={`options-${entity}`}
                    name="options"
                    rows={4}
                    placeholder={t("fieldOptionsPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("fieldOptionsHint")}</p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="required" className="size-4 rounded border" />
                {t("fieldRequired")}
              </label>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={salvando}>
                  {salvando ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="size-4 mr-2" />
                  )}
                  {t("addButton")}
                </Button>
                {estado.ok && <Badge variant="secondary">{t("added")}</Badge>}
                {estado.erro && (
                  <p className="text-sm text-destructive">
                    {t(`errors.${estado.erro}` as "errors.labelCurto")}
                  </p>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
