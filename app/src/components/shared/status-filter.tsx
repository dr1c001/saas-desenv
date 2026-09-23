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
        {/* A FUNÇÃO é obrigatória, e não enfeite.
            `Select.Value` do base-ui mostra o VALOR CRU quando não recebe
            `children` — e como o filtro nasce com "ALL" selecionado, o
            `placeholder` nunca chega a valer. O resultado era a palavra "ALL"
            aparecendo no lugar de "Todos" em TODAS as telas com filtro:
            clientes, financeiro, histórico, manutenção, orçamentos, OS e bens.
            (Achado olhando a tela de bens em 02/09/2026.) */}
        <SelectValue>
          {(v) => options.find((o) => o.value === v)?.label ?? allLabel}
        </SelectValue>
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
