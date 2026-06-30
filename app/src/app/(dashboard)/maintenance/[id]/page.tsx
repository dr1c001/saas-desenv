import { notFound } from "next/navigation"
import Link from "next/link"
import { getMaintenanceOrder, updateMaintenanceStatus, deleteMaintenanceOrder } from "@/actions/maintenance"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { DeleteButton } from "@/components/shared/delete-button"
import { MaintenanceStatusButton } from "@/components/maintenance/status-button"
import { formatCurrency, formatDate, formatOmNumber } from "@/lib/utils"
import { ChevronLeft } from "lucide-react"

const statusConfig: Record<string, {
  label: string; variant: "default" | "secondary" | "outline" | "destructive";
  next?: string; nextLabel?: string
}> = {
  OPEN: { label: "Aberta", variant: "secondary", next: "IN_PROGRESS", nextLabel: "Iniciar manutenção" },
  IN_PROGRESS: { label: "Em andamento", variant: "default", next: "DONE", nextLabel: "Marcar como concluída" },
  DONE: { label: "Concluída", variant: "outline" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
}

export default async function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const om = await getMaintenanceOrder(id)
  if (!om) notFound()

  const config = statusConfig[om.status]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/maintenance" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <p className="text-sm font-mono text-muted-foreground">{formatOmNumber(om.number, om.createdAt)}</p>
            <h1 className="text-2xl font-bold">{om.title}</h1>
            <Badge variant={config.variant} className="mt-1">{config.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.next && (
            <MaintenanceStatusButton
              action={updateMaintenanceStatus.bind(null, id, config.next)}
              label={config.nextLabel!}
            />
          )}
          <DeleteButton action={deleteMaintenanceOrder.bind(null, id)} label="Excluir OM" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {om.provider && (
              <p><span className="text-muted-foreground">Prestador: </span>
                <span className="font-medium">{om.provider.name}</span>
                {om.provider.specialty && <span className="text-muted-foreground"> ({om.provider.specialty})</span>}
              </p>
            )}
            <p><span className="text-muted-foreground">Criada em: </span>{formatDate(om.createdAt)}</p>
            {om.scheduledAt && (
              <p><span className="text-muted-foreground">Agendada: </span>{formatDate(om.scheduledAt)}</p>
            )}
            {om.concludedAt && (
              <p><span className="text-muted-foreground">Concluída: </span>{formatDate(om.concludedAt)}</p>
            )}
          </CardContent>
        </Card>

        {om.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{om.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="p-0">
          {om.items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nenhum item registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {om.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(item.unitPrice))}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(item.total))}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold text-base">
                    {formatCurrency(Number(om.totalAmount))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
