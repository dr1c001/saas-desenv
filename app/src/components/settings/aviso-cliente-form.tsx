"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarAvisoCliente, type EstadoAviso } from "@/actions/aviso-cliente"
import type { ConfigAviso } from "@/lib/aviso-cliente"

export function AvisoClienteForm({
  atual,
  whatsappConfigurado,
}: {
  atual: ConfigAviso
  whatsappConfigurado: boolean
}) {
  const t = useTranslations("avisoClienteConfig")
  const [estado, formAction, salvando] = useActionState<EstadoAviso, FormData>(
    salvarAvisoCliente,
    {}
  )
  const [ativo, setAtivo] = useState(atual.ativo)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {/* Chave-mestra separada do resto: é a decisão que importa, e tem
              que ser um ato consciente, não um checkbox no meio de outros. */}
          <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer">
            <input
              type="checkbox"
              name="ativo"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4 rounded border mt-0.5"
            />
            <span>
              <span className="text-sm font-medium">{t("master")}</span>
              <span className="block text-xs text-muted-foreground mt-1">{t("masterHint")}</span>
            </span>
          </label>

          <fieldset disabled={!ativo} className={ativo ? "space-y-5" : "space-y-5 opacity-50"}>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("whenTitle")}</p>
              <Marcador nome="aCaminho" padrao={atual.aCaminho} rotulo={t("when.aCaminho")} dica={t("when.aCaminhoHint")} />
              <Marcador nome="concluido" padrao={atual.concluido} rotulo={t("when.concluido")} dica={t("when.concluidoHint")} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("howTitle")}</p>
              <Marcador
                nome="porWhatsapp"
                padrao={atual.porWhatsapp}
                rotulo={t("how.whatsapp")}
                dica={whatsappConfigurado ? t("how.whatsappHint") : t("how.whatsappMissing")}
              />
              <Marcador nome="porEmail" padrao={atual.porEmail} rotulo={t("how.email")} dica={t("how.emailHint")} />
            </div>
          </fieldset>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            {t("consent")}
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

function Marcador({
  nome,
  padrao,
  rotulo,
  dica,
}: {
  nome: string
  padrao: boolean
  rotulo: string
  dica: string
}) {
  return (
    <label className="flex items-start gap-3 text-sm cursor-pointer">
      <input type="checkbox" name={nome} defaultChecked={padrao} className="size-4 rounded border mt-0.5" />
      <span>
        {rotulo}
        <span className="block text-xs text-muted-foreground">{dica}</span>
      </span>
    </label>
  )
}
