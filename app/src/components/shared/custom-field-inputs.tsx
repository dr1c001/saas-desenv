"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { nomeDoInput, valorAtual, type DefinicaoCampo } from "@/lib/custom-fields"

// Renderiza os campos que a própria empresa criou. Fica num bloco separado dos
// campos nativos de propósito: deixa claro o que é do sistema e o que é
// configuração da empresa, e some inteiro quando não há campo nenhum.
export function CustomFieldInputs({
  campos,
  valores,
}: {
  campos: DefinicaoCampo[]
  valores?: unknown
}) {
  const t = useTranslations("customFields")

  if (campos.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("formSectionTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campos.map((campo) => {
          const nome = nomeDoInput(campo.id)
          const atual = valorAtual(valores, campo.id)

          return (
            <div key={campo.id} className="space-y-2">
              {campo.type === "CHECKBOX" ? (
                <label className="flex items-center gap-2 text-sm font-medium pt-6">
                  <input
                    type="checkbox"
                    name={nome}
                    defaultChecked={atual === "true"}
                    className="size-4 rounded border"
                  />
                  {campo.label}
                </label>
              ) : (
                <>
                  <Label htmlFor={nome}>
                    {campo.label}
                    {campo.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>

                  {campo.type === "SELECT" ? (
                    // <select> nativo em vez do Select do base-ui: aquele guarda
                    // o valor em estado do React e não envia nada no FormData
                    // sem um input escondido — aqui o form é não-controlado.
                    <select
                      id={nome}
                      name={nome}
                      defaultValue={atual}
                      required={campo.required}
                      className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
                    >
                      <option value="">{t("selectPlaceholder")}</option>
                      {campo.options.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {opcao}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={nome}
                      name={nome}
                      type={campo.type === "NUMBER" ? "text" : campo.type === "DATE" ? "date" : "text"}
                      // NUMBER fica como text: <input type="number"> recusa
                      // vírgula decimal em locale pt-BR e o usuário digita
                      // "1,5" sem entender por que o campo não aceita. A
                      // validação de número acontece no servidor.
                      inputMode={campo.type === "NUMBER" ? "decimal" : undefined}
                      defaultValue={atual}
                      required={campo.required}
                      maxLength={500}
                    />
                  )}
                </>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
