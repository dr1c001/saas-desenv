import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, User } from "lucide-react"
import { getClients } from "@/actions/clients"

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "Ativo", variant: "default" },
  INACTIVE: { label: "Inativo", variant: "secondary" },
  DEFAULTER: { label: "Inadimplente", variant: "destructive" },
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Link href="/clients/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Novo cliente
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <User className="size-8" />
              <p className="text-sm">Nenhum cliente cadastrado ainda.</p>
              <Link href="/clients/new" className={buttonVariants({ variant: "outline" })}>
                Cadastrar primeiro cliente
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.document || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{c._count.serviceOrders}</TableCell>
                    <TableCell>
                      <Badge variant={statusLabel[c.status].variant}>
                        {statusLabel[c.status].label}
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
