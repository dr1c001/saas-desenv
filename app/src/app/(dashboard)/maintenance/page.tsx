import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, Wrench } from "lucide-react"
import { getMaintenanceOrders } from "@/actions/maintenance"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { formatCurrency, formatOmNumber } from "@/lib/utils"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OPEN: { label: "Aberta", variant: "secondary" },
  IN_PROGRESS: { label: "Em andamento", variant: "default" },
  DONE: { label: "Concluída", variant: "outline" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
}

const statusOptions = [
  { value: "OPEN", label: "Aberta" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "DONE", label: "Concluída" },
  { value: "CANCELLED", label: "Cancelada" },
]

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const orders = await getMaintenanceOrders({ q, status })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manutenção Interna</h1>
          <p className="text-sm text-muted-foreground mt-1">Ordens de Manutenção (OM) internas da empresa</p>
        </div>
        <Link href="/maintenance/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Nova OM
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder="Buscar por título..." />
          <StatusFilter options={statusOptions} placeholder="Todos os status" />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {orders.length} {orders.length === 1 ? "ordem" : "ordens"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Wrench className="size-8" />
              <p className="text-sm">
                {q || status ? "Nenhuma OM encontrada com esses filtros." : "Nenhuma OM criada ainda."}
              </p>
              {!q && !status && (
                <Link href="/maintenance/new" className={buttonVariants({ variant: "outline" })}>
                  Criar primeira OM
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Prestador</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((om) => (
                  <TableRow key={om.id}>
                    <TableCell className="font-mono font-medium text-xs">{formatOmNumber(om.number, om.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/maintenance/${om.id}`} className="hover:underline">
                        {om.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{om.provider?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(Number(om.totalAmount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(om.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[om.status].variant}>
                        {statusConfig[om.status].label}
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
