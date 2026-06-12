"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusColor: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  INVOICED: "bg-purple-100 text-purple-800 border-purple-200",
}

type OrderEvent = {
  id: string
  number: number
  title: string
  status: string
  scheduledAt: Date | string | null
  client: { name: string }
  technician: { name: string } | null
}

type Props = {
  events: OrderEvent[]
  initialYear: number
  initialMonth: number
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function Calendar({ events, initialYear, initialMonth }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth) // 1-based

  function prev() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function next() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()

  const byDay = events.reduce<Record<number, OrderEvent[]>>((acc, ev) => {
    if (!ev.scheduledAt) return acc
    const d = new Date(ev.scheduledAt).getDate()
    acc[d] = [...(acc[d] ?? []), ev]
    return acc
  }, {})

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={prev}><ChevronLeft className="size-4" /></Button>
        <span className="font-semibold text-base">{MONTHS[month - 1]} {year}</span>
        <Button variant="ghost" onClick={next}><ChevronRight className="size-4" /></Button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map(d => <div key={d} className="py-1">{d}</div>)}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 border-t border-l">
        {cells.map((day, i) => {
          const isToday = day !== null &&
            today.getDate() === day &&
            today.getMonth() + 1 === month &&
            today.getFullYear() === year
          const dayEvents = day ? (byDay[day] ?? []) : []

          return (
            <div
              key={i}
              className="border-b border-r min-h-[80px] p-1 text-sm"
            >
              {day !== null && (
                <>
                  <span className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday && "bg-primary text-primary-foreground"
                  )}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(ev => (
                      <Link
                        key={ev.id}
                        href={`/service-orders/${ev.id}`}
                        className={cn(
                          "block truncate rounded border px-1 py-0.5 text-xs leading-tight hover:opacity-80 transition-opacity",
                          statusColor[ev.status] ?? "bg-gray-100 text-gray-800"
                        )}
                        title={`OS #${ev.number} — ${ev.title}\n${ev.client.name}`}
                      >
                        #{ev.number} {ev.title}
                      </Link>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-xs text-muted-foreground pl-1">
                        +{dayEvents.length - 2} mais
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {Object.entries(statusColor).map(([status, cls]) => (
          <span key={status} className={cn("rounded border px-2 py-0.5 text-xs", cls)}>
            {{ OPEN: "Aberta", IN_PROGRESS: "Em andamento", DONE: "Concluída", INVOICED: "Faturada" }[status]}
          </span>
        ))}
      </div>
    </div>
  )
}
