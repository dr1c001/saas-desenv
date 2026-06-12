"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  action: () => Promise<void> | void
  label: string
}

export function StatusButton({ action, label }: Props) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(() => action())}
    >
      {isPending ? "Atualizando..." : label}
    </Button>
  )
}
