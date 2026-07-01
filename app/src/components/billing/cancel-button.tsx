"use client"

import { useTransition } from "react"
import { buttonVariants } from "@/components/ui/button"
import { cancelSubscription } from "@/actions/billing"

export function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => {
        if (!confirm("Tem certeza que deseja cancelar a assinatura?")) return
        startTransition(() => cancelSubscription())
      }}
      disabled={pending}
      className={buttonVariants({ variant: "ghost", className: "text-destructive hover:text-destructive text-xs" })}
    >
      {pending ? "Cancelando..." : "Cancelar assinatura"}
    </button>
  )
}
