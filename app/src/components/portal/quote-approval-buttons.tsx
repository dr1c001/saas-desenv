"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

export function QuoteApprovalButtons({ quoteId, clientToken }: { quoteId: string; clientToken: string }) {
  const [status, setStatus] = useState<"idle" | "approved" | "rejected" | "loading">("idle")

  async function handle(action: "APPROVED" | "REJECTED") {
    setStatus("loading")
    await fetch("/api/quote-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId, clientToken, status: action }),
    })
    setStatus(action === "APPROVED" ? "approved" : "rejected")
  }

  if (status === "approved") {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center text-green-700 dark:text-green-400">
        <CheckCircle2 className="size-8 mx-auto mb-2" />
        <p className="font-semibold">Orçamento aprovado!</p>
        <p className="text-sm mt-1">Entraremos em contato para agendar o serviço.</p>
      </div>
    )
  }
  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-700 dark:text-red-400">
        <XCircle className="size-8 mx-auto mb-2" />
        <p className="font-semibold">Orçamento recusado</p>
        <p className="text-sm mt-1">Entre em contato conosco para revisar as condições.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handle("APPROVED")}
        disabled={status === "loading"}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        <CheckCircle2 className="size-5" />
        Aprovar orçamento
      </button>
      <button
        onClick={() => handle("REJECTED")}
        disabled={status === "loading"}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-500 px-4 py-3 font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        <XCircle className="size-5" />
        Recusar
      </button>
    </div>
  )
}
