"use client"

import { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { useQuadroNoTamanhoDaCaixa } from "@/components/shared/usar-quadro"
import { CheckCircle2, RotateCcw, PenLine } from "lucide-react"
import { getTranslator } from "@/lib/i18n"

type Props = {
  orderId: string
  clientToken: string
  existingSignatureUrl?: string | null
  // Portal público não tem sessão — o idioma é o do tenant dono da OS e vem
  // explícito da página, não do cookie do visitante. (Ver lib/i18n.ts.)
  locale: "pt" | "en"
}

export function SignaturePadPublic({ orderId, clientToken, existingSignatureUrl, locale }: Props) {
  const t = getTranslator(locale, "portal")
  const tc = getTranslator(locale, "common")
  const sigRef = useRef<SignatureCanvas>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // O buffer do canvas segue a caixa. Sem isto o traço é gravado numa escala
  // diferente da que o dedo enxerga.
  useQuadroNoTamanhoDaCaixa(sigRef, !saved && !existingSignatureUrl)

  async function handleSave() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError(t("signature.emptyError"))
      return
    }
    setSaving(true)
    setError(null)
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL("image/png")
    const res = await fetch("/api/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, clientToken, signature: dataUrl }),
    })
    const data = await res.json()
    if (data.ok) setSaved(true)
    else setError(data.error)
    setSaving(false)
  }

  if (saved || existingSignatureUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
          <CheckCircle2 className="size-4" />
          {t("signature.confirmed")}
        </div>
        {existingSignatureUrl && (
          <img src={existingSignatureUrl} alt={t("signature.altText")} className="border rounded bg-white max-h-24" />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-center gap-1">
        <PenLine className="size-4" />
        {t("signature.instructions")}
      </p>
      <div className="border rounded bg-white overflow-hidden touch-none">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          // Tamanho pelo CSS, e o buffer segue a caixa. O buffer fixo de 560
          // que ficava aqui era esticado para a largura do celular, e o traço
          // saía deslocado do dedo.
          canvasProps={{ className: "w-full h-40 touch-none" }}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => sigRef.current?.clear()}
          className="flex items-center gap-1 rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          <RotateCcw className="size-3.5" />
          {t("signature.clearButton")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? tc("saving") : t("signature.confirmButton")}
        </button>
      </div>
    </div>
  )
}
