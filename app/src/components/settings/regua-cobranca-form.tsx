"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { salvarReguaCobranca, type EstadoRegua } from "@/actions/regua-cobranca"
import { DEGRAUS_DA_REGUA, type ConfigRegua } from "@/lib/regua-cobranca"

export function ReguaCobrancaForm({
  atual,
  whatsappConfigurado,
}: {
  atual: ConfigRegua
  whatsappConfigurado: boolean
}) {
  const t = useTranslations("reguaCobrancaConfig")
  const [estado, formAction, salvando] = useActionState<EstadoRegua, FormData>(
    salvarReguaCobranca,
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
              <Marcador
                nome="lembrarAntes"
                padrao={atual.lembrarAntes}
                rotulo={t("when.lembrarAntes")}
                dica={t("when.lembrarAntesHint")}
              />
              <Marcador
                nome="cobrarDepois"
                padrao={atual.cobrarDepois}
                rotulo={t("when.cobrarDepois")}
                dica={t("when.cobrarDepoisHint")}
              />
              <Escada />
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

            <div className="space-y-2">
              <label htmlFor="valorMinimo" className="text-sm font-medium">
                {t("minimoTitle")}
              </label>
              <Input
                id="valorMinimo"
                name="valorMinimo"
                type="number"
                min={0}
                step="0.01"
                defaultValue={atual.valorMinimo}
                className="max-w-40"
              />
              <p className="text-xs text-muted-foreground">{t("minimoHint")}</p>
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

/**
 * A escada desenhada, lida da MESMA constante que o cron usa.
 *
 * Mostrar os degraus importa mais aqui do que numa configuração comum: quem
 * liga isso precisa saber exatamente quantas mensagens o cliente dele vai
 * receber, e quando. Escrever "3 dias antes, depois 1, 7, 15 e 30" no texto de
 * ajuda criaria o dia em que a régua muda e a tela continua prometendo a
 * antiga.
 */
function Escada() {
  return (
    <ol className="flex flex-wrap gap-1.5 pt-1">
      {DEGRAUS_DA_REGUA.map((d) => (
        <li
          key={d}
          className="rounded-md border px-2 py-1 text-xs tabular-nums text-muted-foreground"
        >
          {d < 0 ? `${d} d` : `+${d} d`}
        </li>
      ))}
    </ol>
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
