"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  restaurarVocabulario,
  salvarVocabulario,
  type EstadoVocabulario,
} from "@/actions/vocabulario"
import {
  SUGESTOES_OS,
  SUGESTOES_TEC,
  type Termo,
  type Vocabulario,
} from "@/lib/vocabulario"

export function VocabularioForm({ atual }: { atual: Vocabulario }) {
  const t = useTranslations("vocabulario")
  const [estado, formAction, salvando] = useActionState<EstadoVocabulario, FormData>(
    salvarVocabulario,
    {}
  )
  const [restaurando, startTransition] = useTransition()

  const [os, setOs] = useState<Termo>(atual.os)
  const [tec, setTec] = useState<Termo>(atual.tec)

  return (
    <form action={formAction} className="space-y-6">
      <BlocoTermo
        prefixo="os"
        titulo={t("os.title")}
        ajuda={t("os.help")}
        termo={os}
        aoTrocar={setOs}
        sugestoes={SUGESTOES_OS}
      />
      <BlocoTermo
        prefixo="tec"
        titulo={t("tec.title")}
        ajuda={t("tec.help")}
        termo={tec}
        aoTrocar={setTec}
        sugestoes={SUGESTOES_TEC}
      />

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{t("preview.title")}</p>
        {/* Prévia montada com as MESMAS regras do servidor: quem está
            escolhendo precisa ver "Novo chamado" antes de salvar, senão só
            descobre a concordância errada depois que o sistema inteiro mudou. */}
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>• {`Nov${os.genero === "f" ? "a" : "o"} ${os.curto}`}</li>
          <li>• {`${os.genero === "f" ? "As" : "Os"} ${os.plural} concluíd${os.genero === "f" ? "as" : "os"}`}</li>
          <li>• {`Sem ${os.plural} ativ${os.genero === "f" ? "as" : "os"} no momento.`}</li>
          <li>• {`${tec.plural.charAt(0).toUpperCase() + tec.plural.slice(1)} em campo`}</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={salvando || restaurando}>
          {salvando ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={salvando || restaurando}
          onClick={() => {
            if (confirm(t("confirmRestore"))) {
              startTransition(() => { restaurarVocabulario() })
            }
          }}
        >
          <RotateCcw className="size-4 mr-2" />
          {t("restore")}
        </Button>
        {estado.ok && <Badge variant="secondary">{t("saved")}</Badge>}
        {estado.erro && (
          <p className="text-sm text-destructive">
            {t(`errors.${estado.erro}` as "errors.termoCurto")}
          </p>
        )}
      </div>
    </form>
  )
}

function BlocoTermo({
  prefixo,
  titulo,
  ajuda,
  termo,
  aoTrocar,
  sugestoes,
}: {
  prefixo: "os" | "tec"
  titulo: string
  ajuda: string
  termo: Termo
  aoTrocar: (t: Termo) => void
  sugestoes: Termo[]
}) {
  const t = useTranslations("vocabulario")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-sm text-muted-foreground">{ajuda}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sugestões prontas: sem elas a empresa teria que pensar em plural e
            gênero antes de descobrir que o sistema serve pra ela. */}
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((s) => (
            <button
              key={s.curto}
              type="button"
              onClick={() => aoTrocar(s)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                s.curto === termo.curto ? "border-primary bg-primary/10" : "hover:bg-muted"
              }`}
            >
              {s.curto}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            id={`${prefixo}Curto`}
            rotulo={t("fields.curto")}
            dica={t("fields.curtoHint")}
            valor={termo.curto}
            aoTrocar={(v) => aoTrocar({ ...termo, curto: v })}
          />
          <Campo
            id={`${prefixo}Singular`}
            rotulo={t("fields.singular")}
            dica={t("fields.singularHint")}
            valor={termo.singular}
            aoTrocar={(v) => aoTrocar({ ...termo, singular: v })}
          />
          <Campo
            id={`${prefixo}Plural`}
            rotulo={t("fields.plural")}
            dica={t("fields.pluralHint")}
            valor={termo.plural}
            aoTrocar={(v) => aoTrocar({ ...termo, plural: v })}
          />
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}Genero`}>{t("fields.genero")}</Label>
            <select
              id={`${prefixo}Genero`}
              name={`${prefixo}Genero`}
              value={termo.genero}
              onChange={(e) => aoTrocar({ ...termo, genero: e.target.value as "f" | "m" })}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="f">{t("fields.feminino")}</option>
              <option value="m">{t("fields.masculino")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("fields.generoHint")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Campo({
  id,
  rotulo,
  dica,
  valor,
  aoTrocar,
}: {
  id: string
  rotulo: string
  dica: string
  valor: string
  aoTrocar: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={id}
        value={valor}
        onChange={(e) => aoTrocar(e.target.value)}
        required
        maxLength={30}
      />
      <p className="text-xs text-muted-foreground">{dica}</p>
    </div>
  )
}
