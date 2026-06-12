"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { markRevenuePaid, markExpensePaid } from "@/actions/finance"
import { CheckCircle } from "lucide-react"

type Props = {
  type: "revenue" | "expense"
  id: string
}

export function PayButton({ type, id }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      if (type === "revenue") return markRevenuePaid(id)
      return markExpensePaid(id)
    })
  }

  return (
    <Button variant="ghost" size="sm" disabled={isPending} onClick={handleClick}>
      <CheckCircle className="size-4 mr-1" />
      {isPending ? "..." : "Pagar"}
    </Button>
  )
}
