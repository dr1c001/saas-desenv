"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  action: () => Promise<void>
  label: string
}

export function MaintenanceStatusButton({ action, label }: Props) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      onClick={() => startTransition(() => action())}
      disabled={isPending}
    >
      {isPending ? "Atualizando..." : label}
    </Button>
  )
}
