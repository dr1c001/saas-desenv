"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

type Props = {
  action: () => Promise<void>
  label: string
}

export function MaintenanceStatusButton({ action, label }: Props) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations("maintenance")

  return (
    <Button
      size="sm"
      onClick={() => startTransition(() => action())}
      disabled={isPending}
    >
      {isPending ? t("statusButton.updating") : label}
    </Button>
  )
}
