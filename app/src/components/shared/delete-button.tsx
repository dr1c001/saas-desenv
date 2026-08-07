"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

type Props = {
  action: () => Promise<void> | void
  label?: string
}

export function DeleteButton({ action, label }: Props) {
  const t = useTranslations("sharedComponents.deleteButton")
  const tCommon = useTranslations("common")
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(t("confirm"))) return
    startTransition(() => action())
  }

  return (
    <Button variant="destructive" disabled={isPending} onClick={handleClick}>
      <Trash2 className="size-4 mr-2" />
      {isPending ? t("deleting") : label ?? tCommon("delete")}
    </Button>
  )
}
