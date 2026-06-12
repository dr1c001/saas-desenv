import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, ClipboardList } from "lucide-react"
import { getServiceOrders } from "@/actions/service-orders"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { formatCurrency } from "@/lib/utils"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OPEN: { label: "Aberta", variant: "secondary" },
  IN_PROGRESS: { label: "Em andamento", variant: "default" },
  DONE: { label: "Concluída", variant: "outline" },
  INVOICED: { label: "Faturada", variant: "outline" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
}

const statusOptions = [
  { value: "OPEN", label: "Aberta" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "DONE", label: "Concluída" },
  { value: "INVOICED", label: "Faturada" },
  { value: "CANCELLED", label: "Cancelada" },
]

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function ServiceOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const orders = await getServiceOrders({ q, status })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
        <Link href="/service-orders/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Nova OS
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder="Buscar por título ou cliente..." />
          <StatusFilter options={statusOptions} placeholder="Todos os status" />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {orders.length} ordem{orders.length !== 1 ? "s" : ""}
            {(q || status) && " encontrada" + (orders.length !== 1 ? "s" : "")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ClipboardList className="size-8" />
              <p className="text-sm">
                {q || status ? "Nenhuma OS encontrada com esses filtros." : "Nenhuma OS criada ainda."}
              </p>
              {!q && !status && (
                <Link href="/service-orders/new" className={buttonVariants({ variant: "outline" })}>
                  Criar primeira OS
                </Link>
              )}
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
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((os) => (
                  <TableRow key={os.id}>
                    <TableCell className="font-medium">#{os.number}</TableCell>
                    <TableCell>
                      <Link href={`/service-orders/${os.id}`} className="hover:underline">
                        {os.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{os.client.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {os.technician?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatCurrency(Number(os.totalAmount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(os.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[os.status].variant}>
                        {statusConfig[os.status].label}
                      </Badge>
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
