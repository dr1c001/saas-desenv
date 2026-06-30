import Link from "next/link"
import { Suspense } from "react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { History, FileDown } from "lucide-react"
import { getServiceOrders } from "@/actions/service-orders"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DONE: { label: "Concluída", variant: "outline" },
  INVOICED: { label: "Faturada", variant: "default" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
}

const statusOptions = [
  { value: "DONE", label: "Concluída" },
  { value: "INVOICED", label: "Faturada" },
  { value: "CANCELLED", label: "Cancelada" },
]

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  // Default to completed/invoiced/cancelled if no filter selected
  const effectiveStatus = status || undefined
  const orders = await getServiceOrders({
    q,
    status: effectiveStatus,
    statusIn: effectiveStatus ? undefined : ["DONE", "INVOICED", "CANCELLED"],
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Serviços</h1>
          <p className="text-sm text-muted-foreground mt-1">Ordens concluídas, faturadas e canceladas</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder="Buscar por título ou cliente..." />
          <StatusFilter options={statusOptions} placeholder="Todos" />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {orders.length} registro{orders.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <History className="size-8" />
              <p className="text-sm">Nenhum serviço concluído ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Concluída</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((os) => (
                  <TableRow key={os.id}>
                    <TableCell className="font-mono text-xs">{formatOsNumber(os.number, os.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/service-orders/${os.id}`} className="hover:underline">
                        {os.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{os.client.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{os.technician?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(Number(os.totalAmount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {os.concludedAt ? formatDate(os.concludedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[os.status]?.variant ?? "secondary"}>
                        {statusConfig[os.status]?.label ?? os.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/api/pdf/service-order/${os.id}`}
                        target="_blank"
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        <FileDown className="size-3.5 mr-1" />
                        PDF
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
