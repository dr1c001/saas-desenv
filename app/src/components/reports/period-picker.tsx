"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function PeriodPicker({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", form.get("from") as string)
    params.set("to", form.get("to") as string)
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="from">De</Label>
        <Input id="from" name="from" type="date" defaultValue={defaultFrom} className="w-36" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to">Até</Label>
        <Input id="to" name="to" type="date" defaultValue={defaultTo} className="w-36" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Filtrando..." : "Aplicar"}
      </Button>
    </form>
  )
}
