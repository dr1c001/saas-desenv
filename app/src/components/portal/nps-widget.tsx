"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { getTranslator } from "@/lib/i18n"

type Props = {
  orderId: string
  clientToken: string
  existingScore: number | null
  existingFeedback: string | null
  // Portal público não tem sessão — o idioma é o do tenant dono da OS e vem
  // explícito da página, não do cookie do visitante. (Ver lib/i18n.ts.)
  locale: "pt" | "en"
  // Nota sugerida pelo link do e-mail (?score=N) — só pré-seleciona, quem
  // decide se a nota é gravada é o clique em "Enviar avaliação" (POST de
  // verdade). Um GET que já gravasse a nota era vulnerável a scanner de
  // e-mail corporativo pré-buscando os 11 links e gravando uma nota
  // aleatória sem o cliente nunca ter clicado em nada. (Achado em auditoria
  // pré-venda, 2026-08-05.)
  prefillScore?: number | null
}

export function NpsWidget({ orderId, clientToken, existingScore, existingFeedback, prefillScore, locale }: Props) {
  const t = getTranslator(locale, "portal")
  const [score, setScore] = useState<number | null>(existingScore ?? prefillScore ?? null)
  const [feedback, setFeedback] = useState(existingFeedback ?? "")
  const [saved, setSaved] = useState(!!existingScore)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function handleSave() {
    if (score === null) return
    setSaving(true)
    setError(false)
    try {
      const res = await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, clientToken, score, feedback }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      setSaved(true)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-green-600">
        <CheckCircle2 className="size-8" />
        <p className="font-semibold">{t("nps.thanks")}</p>
        {feedback && <p className="text-sm text-muted-foreground text-center">&ldquo;{feedback}&rdquo;</p>}
      </div>
    )
  }

  const label = score === null ? "" : score >= 9 ? t("nps.promoter") : score >= 7 ? t("nps.passive") : t("nps.detractor")

  return (
    <div className="space-y-4">
      <p className="text-sm">{t("nps.question")}</p>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setScore(i)}
            className={`size-9 rounded-lg border text-sm font-semibold transition-colors ${
              score === i
                ? i >= 9 ? "bg-green-500 text-white border-green-500"
                  : i >= 7 ? "bg-yellow-500 text-white border-yellow-500"
                  : "bg-red-500 text-white border-red-500"
                : "hover:bg-muted"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      {score !== null && <p className="text-sm font-medium">{label}</p>}
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={t("nps.feedbackPlaceholder")}
        rows={3}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
      />
      {error && <p className="text-xs text-red-500">{t("nps.saveError")}</p>}
      <button
        onClick={handleSave}
        disabled={score === null || saving}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? t("nps.submitting") : t("nps.submit")}
      </button>
    </div>
  )
}
