"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Option = { value: string; label: string }

type Props = {
  paramKey?: string
  options: Option[]
  placeholder?: string
}

export function StatusFilter({ paramKey = "status", options, placeholder = "Todos" }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

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
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
