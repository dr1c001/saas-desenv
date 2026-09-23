"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { getTranslator } from "@/lib/i18n"

type Props = {
  quoteId: string
  clientToken: string
  // Portal público não tem sessão — o idioma é o do tenant dono do orçamento
  // e vem explícito da página, não do cookie do visitante. (Ver lib/i18n.ts.)
  locale: "pt" | "en"
}

export function QuoteApprovalButtons({ quoteId, clientToken, locale }: Props) {
  const t = getTranslator(locale, "portal")
  const [status, setStatus] = useState<"idle" | "approved" | "rejected" | "loading">("idle")
  const [error, setError] = useState(false)

  async function handle(action: "APPROVED" | "REJECTED") {
    setStatus("loading")
    setError(false)
    try {
      const res = await fetch("/api/quote-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, clientToken, status: action }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      setStatus(action === "APPROVED" ? "approved" : "rejected")
    } catch {
      setError(true)
      setStatus("idle")
    }
  }

  if (status === "approved") {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center text-green-700 dark:text-green-400">
        <CheckCircle2 className="size-8 mx-auto mb-2" />
        <p className="font-semibold">{t("quote.approvedTitle")}</p>
        <p className="text-sm mt-1">{t("quote.approvedMessage")}</p>
      </div>
    )
  }
  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-700 dark:text-red-400">
        <XCircle className="size-8 mx-auto mb-2" />
        <p className="font-semibold">{t("quote.rejectedTitle")}</p>
        <p className="text-sm mt-1">{t("quote.rejectedMessage")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <button
          onClick={() => handle("APPROVED")}
          disabled={status === "loading"}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle2 className="size-5" />
          {t("quote.approveButton")}
        </button>
        <button
          onClick={() => handle("REJECTED")}
          disabled={status === "loading"}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-500 px-4 py-3 font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
        >
          <XCircle className="size-5" />
          {t("quote.rejectButton")}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 text-center">{t("quote.responseError")}</p>}
    </div>
  )
}
