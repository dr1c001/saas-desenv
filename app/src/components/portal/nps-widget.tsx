"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

type Props = { orderId: string; existingScore: number | null; existingFeedback: string | null }

export function NpsWidget({ orderId, existingScore, existingFeedback }: Props) {
  const [score, setScore] = useState<number | null>(existingScore)
  const [feedback, setFeedback] = useState(existingFeedback ?? "")
  const [saved, setSaved] = useState(!!existingScore)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (score === null) return
    setSaving(true)
    await fetch("/api/nps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, score, feedback }),
    })
    setSaved(true)
    setSaving(false)
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-green-600">
        <CheckCircle2 className="size-8" />
        <p className="font-semibold">Obrigado pela avaliação! ⭐</p>
        {feedback && <p className="text-sm text-muted-foreground text-center">&ldquo;{feedback}&rdquo;</p>}
      </div>
    )
  }

  const label = score === null ? "" : score >= 9 ? "Promotor 😊" : score >= 7 ? "Neutro 😐" : "Detrator 😟"

  return (
    <div className="space-y-4">
      <p className="text-sm">De 0 a 10, qual a probabilidade de você nos recomendar?</p>
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
        placeholder="Deixe um comentário (opcional)..."
        rows={3}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
      />
      <button
        onClick={handleSave}
        disabled={score === null || saving}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Enviando..." : "Enviar avaliação"}
      </button>
    </div>
  )
}
