"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export function SearchBar({ placeholder = "Buscar..." }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set("q", value)
      } else {
        params.delete("q")
      }
      params.delete("page")
      startTransition(() => router.replace(`${pathname}?${params.toString()}`))
    }, 300)
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        className="pl-8 w-60"
        placeholder={placeholder}
        defaultValue={searchParams.get("q") ?? ""}
        onChange={handleChange}
      />
    </div>
  )
}
