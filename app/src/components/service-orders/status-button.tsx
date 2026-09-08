"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { enfileirar, semRede } from "@/lib/usar-fila-offline"

type Props = {
  action: () => Promise<void> | void
  label: string
  /** Pra poder enfileirar quando nao ha rede. */
  orderId: string
  status: string
}

export function StatusButton({ action, label, orderId, status }: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Mesma regra do dialogo de conclusao: com rede vai direto, sem rede
          // entra na fila. O tecnico marca "a caminho" saindo da oficina e
          // "em andamento" no local, que costuma ser justo onde nao ha sinal.
          if (semRede()) {
            await enfileirar("MUDAR_STATUS", orderId, { status })
            return
          }
          await action()
        })
      }
    >
      {isPending ? t("statusButton.updating") : label}
    </Button>
  )
}
