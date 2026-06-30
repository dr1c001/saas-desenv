import { notFound } from "next/navigation"
import Link from "next/link"
import { getClient } from "@/actions/clients"
import { deleteClient } from "@/actions/clients"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Pencil, Plus } from "lucide-react"
import { DeleteButton } from "@/components/shared/delete-button"
import { formatCurrency, formatOsNumber } from "@/lib/utils"

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "Ativo", variant: "default" },
  INACTIVE: { label: "Inativo", variant: "secondary" },
  DEFAULTER: { label: "Inadimplente", variant: "destructive" },
}

const osStatusLabel: Record<string, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  INVOICED: "Faturada",
  CANCELLED: "Cancelada",
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getClient(id)
  if (!client) notFound()

  const addr = client.address
  const addressLine = addr
    ? [addr.street, addr.number, addr.district, addr.city, addr.state]
        .filter(Boolean)
        .join(", ")
    : null

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <Badge variant={statusLabel[client.status].variant} className="mt-1">
            {statusLabel[client.status].label}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil className="size-4 mr-2" />
            Editar
          </Link>
          <DeleteButton action={deleteClient.bind(null, id)} label="Excluir cliente" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {client.document && <p><span className="text-muted-foreground">Doc:</span> {client.document}</p>}
            {client.phone && <p><span className="text-muted-foreground">Tel:</span> {client.phone}</p>}
            {client.email && <p><span className="text-muted-foreground">E-mail:</span> {client.email}</p>}
            {!client.document && !client.phone && !client.email && (
              <p className="text-muted-foreground">Nenhum contato informado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {addressLine || <p className="text-muted-foreground">Não informado.</p>}
            {addr?.zipCode && <p className="text-muted-foreground">CEP: {addr.zipCode}</p>}
          </CardContent>
        </Card>
      </div>

      {client.serviceOrders.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de OS</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{client.serviceOrders.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Faturado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  client.serviceOrders
                    .filter((o) => o.status === "INVOICED" || o.status === "DONE")
                    .reduce((s, o) => s + Number(o.totalAmount), 0)
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">OS Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {client.serviceOrders.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS").length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ordens de Serviço</h2>
          <Link
            href={`/service-orders/new?clientId=${id}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Plus className="size-4 mr-2" />
            Nova OS
          </Link>
        </div>

        {client.serviceOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma OS para este cliente.</p>
        ) : (
          <div className="space-y-2">
            {client.serviceOrders.map((os) => (
              <Link
                key={os.id}
                href={`/service-orders/${os.id}`}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{formatOsNumber(os.number, os.createdAt)} — {os.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(os.createdAt).toLocaleDateString("pt-BR")} · {formatCurrency(Number(os.totalAmount))}
                  </p>
                </div>
                <Badge variant="outline">{osStatusLabel[os.status]}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
