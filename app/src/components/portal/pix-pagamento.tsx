"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { getTranslator } from "@/lib/i18n"
import type { Qr } from "@/lib/qr"
import { formatCurrency } from "@/lib/utils"

type Props = {
  codigo: string
  // Vem pronto do servidor: o QR é determinístico, então gerar aqui só
  // colocaria a biblioteca no bundle de quem vai olhar a tela.
  qr: Qr
  valor: number | null
  recebedor: string
  // Portal público não tem sessão — o idioma é o do tenant dono do documento
  // e vem explícito da página. (Ver lib/i18n.ts.)
  locale: "pt" | "en"
}

export function PixPagamento({ codigo, qr, valor, recebedor, locale }: Props) {
  const t = getTranslator(locale, "portal")
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
    } catch {
      // Sem permissão de área de transferência (página aberta em http,
      // navegador antigo): seleciona o texto pra pessoa copiar na mão, em vez
      // de não acontecer nada e ela achar que travou.
      const el = document.getElementById("pix-codigo")
      if (!el) return
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {valor !== null && (
        <p className="text-2xl font-bold tabular-nums">{formatCurrency(valor)}</p>
      )}

      {/* Fundo branco sempre, inclusive no modo escuro: leitor de QR espera
          módulo escuro sobre claro, e muito celular não lê o invertido. */}
      <div className="rounded-lg bg-white p-3">
        <svg
          viewBox={`0 0 ${qr.tamanho} ${qr.tamanho}`}
          className="size-48"
          shapeRendering="crispEdges"
          role="img"
          aria-label={t("pix.scan")}
        >
          <rect width={qr.tamanho} height={qr.tamanho} fill="#fff" />
          <path d={qr.caminho} fill="#000" />
        </svg>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">{t("pix.scan")}</p>
        <p className="text-xs text-muted-foreground">
          {t("pix.receiver")}: {recebedor}
        </p>
        {valor === null && (
          <p className="text-xs text-amber-600 dark:text-amber-500">{t("pix.openAmount")}</p>
        )}
      </div>

      <div className="w-full space-y-2">
        <p className="text-xs text-muted-foreground text-center">{t("pix.orCopy")}</p>
        <p
          id="pix-codigo"
          className="rounded-md border bg-muted/50 p-2 text-[10px] leading-tight break-all font-mono"
        >
          {codigo}
        </p>
        <button
          type="button"
          onClick={copiar}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copiado ? t("pix.copied") : t("pix.copy")}
        </button>
      </div>
    </div>
  )
}
