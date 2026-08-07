"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { buttonVariants } from "@/components/ui/button"
import { cancelSubscription } from "@/actions/billing"

export function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition()
  const t = useTranslations("billingReferral.billing.cancel")

  return (
    <button
      onClick={() => {
        if (!confirm(t("confirm"))) return
        startTransition(() => cancelSubscription())
      }}
      disabled={pending}
      className={buttonVariants({ variant: "ghost", className: "text-destructive hover:text-destructive text-xs" })}
    >
      {pending ? t("pending") : t("label")}
    </button>
  )
}
