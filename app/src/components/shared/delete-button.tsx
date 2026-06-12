"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

type Props = {
  action: () => Promise<void> | void
  label?: string
}

export function DeleteButton({ action, label = "Excluir" }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Tem certeza que deseja excluir? Esta ação não pode ser desfeita.`)) return
    startTransition(() => action())
  }

  return (
    <Button variant="destructive" disabled={isPending} onClick={handleClick}>
      <Trash2 className="size-4 mr-2" />
      {isPending ? "Excluindo..." : label}
    </Button>
  )
}
