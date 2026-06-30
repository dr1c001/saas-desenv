import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, FileText, FileDown } from "lucide-react"
import { getQuotes } from "@/actions/quotes"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Rascunho", variant: "outline" },
  SENT: { label: "Enviado", variant: "secondary" },
  APPROVED: { label: "Aprovado", variant: "default" },
  REJECTED: { label: "Recusado", variant: "destructive" },
}

const statusOptions = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "SENT", label: "Enviado" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "REJECTED", label: "Recusado" },
]

function fmt(value: unknown) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString("pt-BR")
}

function quoteNum(number: number, createdAt: Date | string) {
  const year = new Date(createdAt).getFullYear()
  return `ORC${year}${String(number).padStart(4, "0")}`
}

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const quotes = await getQuotes({ q, status })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orçamentos</h1>
        <Link href="/quotes/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Novo orçamento
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder="Buscar por cliente, descrição..." />
          <StatusFilter options={statusOptions} placeholder="Todos os status" />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {quotes.length} orçamento{quotes.length !== 1 ? "s" : ""}
            {(q || status) && " encontrado" + (quotes.length !== 1 ? "s" : "")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="size-8" />
              <p className="text-sm">
                {q || status ? "Nenhum orçamento encontrado com esses filtros." : "Nenhum orçamento cadastrado ainda."}
              </p>
              {!q && !status && (
                <Link href="/quotes/new" className={buttonVariants({ variant: "outline" })}>
                  Criar primeiro orçamento
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/quotes/${q.id}`} className="hover:underline font-medium">
                        {quoteNum(q.number, q.createdAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/quotes/${q.id}`} className="font-medium hover:underline">
                        {q.clientName}
                      </Link>
                      {q.clientContact && (
                        <p className="text-xs text-muted-foreground">{q.clientContact}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[220px] truncate text-muted-foreground">
                      {q.description}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{fmt(q.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {q.validUntil ? fmtDate(q.validUntil) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[q.status].variant}>
                        {statusConfig[q.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/api/pdf/quote/${q.id}`}
                        target="_blank"
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        <FileDown className="size-3.5" />
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
