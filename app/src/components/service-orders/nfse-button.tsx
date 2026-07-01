"use client"

import { useState } from "react"
import { buttonVariants } from "@/components/ui/button"
import { FileText, ExternalLink, Loader2 } from "lucide-react"

type Props = {
  orderId: string
  nfseId?: string | null
  nfseStatus?: string | null
  nfseUrl?: string | null
  nfseNumber?: string | null
}

export function NfseButton({ orderId, nfseId, nfseStatus, nfseUrl, nfseNumber }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitted, setEmitted] = useState(false)

  if (nfseId || emitted) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <FileText className="size-3.5" />
          NFS-e {nfseNumber ? `#${nfseNumber}` : ""} — {nfseStatus ?? "emitida"}
        </span>
        {nfseUrl && (
          <a
            href={nfseUrl}
            target="_blank"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink className="size-3.5 mr-1" />
            Ver NFS-e
          </a>
        )}
      </div>
    )
  }

  async function handleEmit() {
    if (!confirm("Emitir NFS-e para esta OS?")) return
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
        Emitir NFS-e
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
