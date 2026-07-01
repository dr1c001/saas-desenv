import { getScheduledOrders } from "@/actions/schedule"
import { Calendar } from "@/components/schedule/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"
import { formatOsNumber } from "@/lib/utils"

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const { year: ys, month: ms } = await searchParams
  const now = new Date()
  const year = ys ? parseInt(ys) : now.getFullYear()
  const month = ms ? parseInt(ms) : now.getMonth() + 1

  const events = await getScheduledOrders(year, month)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agendamento</h1>
        <Link href="/service-orders/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Nova OS
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="pt-4">
            <Calendar events={events} initialYear={year} initialMonth={month} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {events.length} OS agendada{events.length !== 1 ? "s" : ""} no mês
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma OS agendada.</p>
              ) : (
                events.map(ev => (
                  <Link
                    key={ev.id}
                    href={`/service-orders/${ev.id}`}
                    className="block rounded-lg border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-medium font-mono">{formatOsNumber(ev.number, ev.createdAt)}</p>
                    <p className="text-xs text-muted-foreground truncate">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">{ev.client.name}</p>
                    <p className="text-xs font-medium mt-1">
                      {new Date(ev.scheduledAt!).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
