"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { buttonVariants } from "@/components/ui/button"
import { FileText, ExternalLink, Loader2, Download } from "lucide-react"

type Props = {
  orderId: string
  nfseId?: string | null
  nfseStatus?: string | null
  nfseUrl?: string | null
  nfseNumber?: string | null
}

export function NfseButton({ orderId, nfseId, nfseStatus, nfseUrl, nfseNumber }: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitted, setEmitted] = useState(false)

  if (nfseId || emitted) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <FileText className="size-3.5" />
          NFS-e {nfseNumber ? `#${nfseNumber}` : ""} — {nfseStatus ?? t("nfseButton.statusEmitted")}
        </span>
        {/* A nota GUARDADA por nós. É esta que responde "o cliente pediu a
            nota de novo": o link do emissor expira e some no dia em que a
            empresa trocar de fornecedor. */}
        <a
          href={`/api/nota/${orderId}`}
          target="_blank"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileText className="size-3.5 mr-1" />
          {t("nfseButton.baixarPdf")}
        </a>
        {/* O XML vai para a contabilidade, e juridicamente é ELE que vale — o
            PDF é uma representação dele. */}
        <a
          href={`/api/nota/${orderId}?tipo=xml`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-3.5 mr-1" />
          {t("nfseButton.baixarXml")}
        </a>
        {nfseUrl && (
          <a
            href={nfseUrl}
            target="_blank"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLink className="size-3.5 mr-1" />
            {t("nfseButton.viewLink")}
          </a>
        )}
      </div>
    )
  }

  async function handleEmit() {
    if (!confirm(t("nfseButton.confirmEmit"))) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/nfse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setEmitted(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleEmit}
        disabled={loading}
        className={buttonVariants({ variant: "outline" })}
      >
        {loading ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <FileText className="size-4 mr-2" />
        )}
        {t("nfseButton.emitButton")}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
