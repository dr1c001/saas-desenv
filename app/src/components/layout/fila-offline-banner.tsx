"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle, CloudUpload, Loader2 } from "lucide-react"
import { useFilaOffline } from "@/lib/usar-fila-offline"

/**
 * O que está aguardando envio.
 *
 * Existe porque a fila faz uma promessa séria: o técnico fechou o serviço, foi
 * embora e acha que está registrado. Sem este aviso ele não tem como saber se
 * pode fechar o app — e "não sei se salvou" é pior que "não salvou", porque
 * ninguém age sobre a dúvida.
 *
 * Some sozinho quando a fila esvazia. Faixa permanente vira paisagem.
 */
export function FilaOfflineBanner() {
  const { pendentes, travadas, sincronizando } = useFilaOffline()
  const t = useTranslations("offline.fila")

  if (pendentes === 0 && travadas === 0) return null

  // Travada é mais grave e ganha a faixa: aquele trabalho NÃO chegou e não vai
  // chegar sozinho.
  if (travadas > 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-sm"
      >
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
        <span>
          <strong className="font-medium">{t("travadas", { n: travadas })}</strong>{" "}
          {t("travadasAjuda")}
        </span>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-primary/30 bg-primary/5 px-4 py-2 text-sm"
    >
      {sincronizando ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      ) : (
        <CloudUpload className="size-4 shrink-0 text-primary" />
      )}
      <span>
        <strong className="font-medium">{t("pendentes", { n: pendentes })}</strong>{" "}
        {sincronizando ? t("enviando") : t("pendentesAjuda")}
      </span>
    </div>
  )
}
