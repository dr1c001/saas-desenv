"use client"

import { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { buttonVariants } from "@/components/ui/button"
import { CheckCircle2, RotateCcw, PenLine } from "lucide-react"

type Props = { orderId: string; existingSignatureUrl?: string | null }

export function SignaturePad({ orderId, existingSignatureUrl }: Props) {
  const sigRef = useRef<SignatureCanvas>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Por favor, assine antes de salvar.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL("image/png")
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, signature: dataUrl }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (saved || existingSignatureUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          Assinatura do cliente registrada
        </div>
        {existingSignatureUrl && (
          <img
            src={existingSignatureUrl}
            alt="Assinatura do cliente"
            className="border rounded-md bg-white max-h-24"
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground flex items-center gap-1">
        <PenLine className="size-4" />
        Solicite ao cliente que assine abaixo para confirmar a execução do serviço.
      </p>
      <div className="border rounded-md bg-white overflow-hidden touch-none">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{ width: 560, height: 160, className: "w-full" }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => sigRef.current?.clear()}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <RotateCcw className="size-3.5 mr-1" />
          Limpar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={buttonVariants({ size: "sm" })}
        >
          {saving ? "Salvando..." : "Confirmar assinatura"}
        </button>
      </div>
    </div>
  )
}
