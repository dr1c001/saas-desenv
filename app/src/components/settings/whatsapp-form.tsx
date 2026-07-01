"use client"

import { useActionState } from "react"
import { updateWhatsApp } from "@/actions/settings"
import { MessageCircle } from "lucide-react"

type Props = { zapiInstance: string | null; zapiToken: string | null }

export function WhatsAppForm({ zapiInstance, zapiToken }: Props) {
  const [state, action, pending] = useActionState(updateWhatsApp, {})

  return (
    <form action={action} className="space-y-4">
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm space-y-2">
        <p className="font-medium flex items-center gap-2"><MessageCircle className="size-4 text-green-500" /> Como configurar o Z-API:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Crie sua conta em <strong>z-api.io</strong></li>
          <li>Crie uma instância e escaneie o QR code com seu WhatsApp</li>
          <li>Copie o <strong>ID da instância</strong> e o <strong>Token</strong> abaixo</li>
        </ol>
      </div>
      <div>
        <label className="text-sm font-medium">ID da Instância Z-API</label>
        <input
          name="zapiInstance"
          defaultValue={zapiInstance ?? ""}
          placeholder="Ex: 3C5F1D2E..."
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Token Z-API</label>
        <input
          name="zapiToken"
          defaultValue={zapiToken ?? ""}
          type="password"
          placeholder="Cole seu token aqui"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar configurações WhatsApp"}
      </button>
    </form>
  )
}
