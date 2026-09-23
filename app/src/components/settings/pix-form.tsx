"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarPix, type ConfigPix, type EstadoPix } from "@/actions/pix"
import { chaveValida, TIPOS_CHAVE, type TipoChavePix } from "@/lib/pix"

export function PixForm({ atual }: { atual: ConfigPix }) {
  const t = useTranslations("pix")
  const [estado, formAction, salvando] = useActionState<EstadoPix, FormData>(salvarPix, {})
  const [tipo, setTipo] = useState<TipoChavePix>(atual.pixKeyType ?? "CNPJ")
  const [chave, setChave] = useState(atual.pixKey ?? "")

  // Aviso na hora de digitar, não só depois de salvar: chave PIX errada só
  // aparece lá na frente, quando o cliente final tenta pagar e não consegue.
  const chaveRuim = chave.trim() !== "" && !chaveValida(chave, tipo)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pixKeyType">{t("keyType.label")}</Label>
              <select
                id="pixKeyType"
                name="pixKeyType"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoChavePix)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                {TIPOS_CHAVE.map((x) => (
                  <option key={x} value={x}>
                    {t(`keyType.options.${x}` as "keyType.options.CPF")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pixKey">{t("key.label")}</Label>
              <Input
                id="pixKey"
                name="pixKey"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                maxLength={120}
                placeholder={t(`key.placeholder.${tipo}` as "key.placeholder.CPF")}
                aria-invalid={chaveRuim}
              />
              {chaveRuim && <p className="text-xs text-destructive">{t("key.invalid")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pixReceiver">{t("receiver.label")}</Label>
              {/* 25 e 15 são os tetos do padrão do Banco Central. Cortar aqui
                  evita a surpresa de ver o nome truncado no app do cliente. */}
              <Input
                id="pixReceiver"
                name="pixReceiver"
                maxLength={25}
                defaultValue={atual.pixReceiver ?? ""}
                placeholder={t("receiver.placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("receiver.hint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pixCity">{t("city.label")}</Label>
              <Input
                id="pixCity"
                name="pixCity"
                maxLength={15}
                defaultValue={atual.pixCity ?? ""}
                placeholder={t("city.placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("city.hint")}</p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            {t("notice")}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {t("save")}
            </Button>
            {estado.ok && <Badge variant="secondary">{t("saved")}</Badge>}
            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`errors.${estado.erro}` as "errors.semPermissao")}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
