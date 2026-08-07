"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

type Props = {
  action: () => Promise<void> | void
  label: string
}

export function StatusButton({ action, label }: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(() => action())}
    >
      {isPending ? t("statusButton.updating") : label}
    </Button>
  )
}
