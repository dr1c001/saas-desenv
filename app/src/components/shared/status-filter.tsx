"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Option = { value: string; label: string }

type Props = {
  paramKey?: string
  options: Option[]
  placeholder?: string
}

export function StatusFilter({ paramKey = "status", options, placeholder }: Props) {
  const t = useTranslations("sharedComponents.statusFilter")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const allLabel = placeholder ?? t("allPlaceholder")

  function handleChange(value: string | null) {
    if (value === null) return
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "ALL") {
      params.set(paramKey, value)
    } else {
      params.delete(paramKey)
    }
    params.delete("page")
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  return (
    <Select
      defaultValue={searchParams.get(paramKey) ?? "ALL"}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
