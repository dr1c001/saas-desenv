"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react"
import {
  apagarCertificado,
  enviarCertificado,
  reenviarCertificado,
  type EstadoDoCertificado,
} from "@/actions/certificado"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  temCertificado: boolean
  nomeArquivo: string | null
  validoAte: string | null
  /** Calculado no SERVIDOR. `Date.now()` no corpo do render é função impura:
   *  o valor da hidratação difere do da renderização, e o React reclama com
   *  razão. Além disso o servidor e o navegador podem estar em fusos
   *  diferentes, e a conta daria dias diferentes na mesma tela. */
  diasParaVencer: number | null
  cofrePronto: boolean
}

/**
 * O envio do certificado A1 da empresa.
 *
 * A senha vai num campo do formulário e nunca volta: nem esta tela nem
 * nenhuma outra lê o que está guardado. O que não sai do servidor não vaza
 * por aqui.
 */
export function CertificadoForm({
  temCertificado,
  nomeArquivo,
  validoAte,
  diasParaVencer,
  cofrePronto,
}: Props) {
  const t = useTranslations("certificado")
  const tc = useTranslations("common")
  const [estado, enviar, pendente] = useActionState<EstadoDoCertificado, FormData>(
    enviarCertificado,
    {}
  )
  const [trocando, setTrocando] = useState(false)

  const vence = validoAte ? new Date(validoAte) : null

  // Sem cofre, guardar seria gravar em claro. A tela não oferece o que a ação
  // vai recusar.
  if (!cofrePronto) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-start gap-2 pt-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{t("cofreAusente")}</span>
        </CardContent>
      </Card>
    )
  }

  if (temCertificado && !trocando) {
    return (
      <div className="space-y-3">
        <Card className="border-green-600/40">
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <ShieldCheck className="size-4" />
              {t("instalado")}
            </div>
            {nomeArquivo && (
              <p className="font-mono text-xs text-muted-foreground">{nomeArquivo}</p>
            )}
            {vence && (
              <p
                className={
                  diasParaVencer !== null && diasParaVencer <= 30
                    ? "text-sm font-medium text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {diasParaVencer !== null && diasParaVencer < 0
                  ? t("venceu", { data: vence.toLocaleDateString() })
                  : t("valeAte", { data: vence.toLocaleDateString() })}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setTrocando(true)}>
            <Upload className="size-3.5 mr-1" />
            {t("trocar")}
          </Button>
          {/* Reenviar é a razão de guardar: quando o emissor perde a
              configuração, dá para mandar de novo sem pedir o arquivo à
              cliente — que é justo a hora em que ela não acha o .pfx. */}
          <Button variant="outline" size="sm" onClick={() => void reenviarCertificado()}>
            <RefreshCw className="size-3.5 mr-1" />
            {t("reenviar")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void apagarCertificado()}>
            <Trash2 className="size-3.5 mr-1" />
            {t("apagar")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={enviar} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="certificado">{t("arquivo")}</Label>
        <Input id="certificado" name="certificado" type="file" accept=".pfx,.p12" required />
        <p className="text-xs text-muted-foreground">{t("arquivoAjuda")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha">{t("senha")}</Label>
        <Input id="senha" name="senha" type="password" autoComplete="off" required />
        <p className="text-xs text-muted-foreground">{t("senhaAjuda")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="validoAte">{t("validade")}</Label>
        <Input id="validoAte" name="validoAte" type="date" />
        <p className="text-xs text-muted-foreground">{t("validadeAjuda")}</p>
      </div>

      {estado.erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          {estado.erro.startsWith("emissor:")
            ? t("erroDoEmissor", { detalhe: estado.erro.replace(/^emissor:\s*/, "") })
            : t(`erro.${estado.erro}` as "erro.arquivoAusente")}
        </p>
      )}

      {estado.ok && (
        <p className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="size-4" />
          {t("enviado")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          <Upload className="size-4 mr-1" />
          {pendente ? tc("saving") : t("enviar")}
        </Button>
        {trocando && (
          <Button type="button" variant="outline" onClick={() => setTrocando(false)}>
            {tc("cancel")}
          </Button>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        {t("comoGuardamos")}
      </p>
    </form>
  )
}
