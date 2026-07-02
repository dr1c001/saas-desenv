"use client"

import { useState } from "react"
import { MessageCircle, Check, AlertCircle } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

type Props = { type: "os" | "quote"; id: string }

export function WhatsAppButton({ type, id }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle")
  const [msg, setMsg] = useState("")

  async function handle() {
    setState("loading")
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      })
      const data = await res.json()
      if (data.ok) {
        setState("ok")
        setTimeout(() => setState("idle"), 3000)
      } else {
        setState("error")
        setMsg(data.error ?? "Erro ao enviar")
        setTimeout(() => setState("idle"), 5000)
      }
    } catch {
      setState("error")
      setMsg("Erro de conexão")
      setTimeout(() => setState("idle"), 5000)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handle}
        disabled={state === "loading"}
        className={buttonVariants({ variant: "outline" }) + " gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"}
      >
        {state === "ok" ? <Check className="size-4" /> : state === "error" ? <AlertCircle className="size-4" /> : <MessageCircle className="size-4" />}
        {state === "loading" ? "Enviando..." : state === "ok" ? "Enviado!" : "WhatsApp"}
      </button>
      {state === "error" && msg && (
        <p className="absolute top-full mt-1 text-xs text-red-500 whitespace-nowrap">{msg}</p>
      )}
    </div>
  )
}
