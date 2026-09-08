import Link from "next/link"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, FileText, FileDown } from "lucide-react"
import { getQuotes } from "@/actions/quotes"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
}

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
  const t = await getTranslations("quotes")
  const tc = await getTranslations("common")

  const statusOptions = [
    { value: "DRAFT", label: tc("quoteStatus.DRAFT") },
    { value: "SENT", label: tc("quoteStatus.SENT") },
    { value: "APPROVED", label: tc("quoteStatus.APPROVED") },
    { value: "REJECTED", label: tc("quoteStatus.REJECTED") },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("list.title")}</h1>
        <Link href="/quotes/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          {t("list.newButton")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder={t("list.searchPlaceholder")} />
          <StatusFilter options={statusOptions} placeholder={t("list.statusFilterPlaceholder")} />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {(q || status)
              ? t("list.resultsFound", { count: quotes.length })
              : t("list.resultsCount", { count: quotes.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="size-8" />
              <p className="text-sm">
                {q || status ? t("list.emptyFiltered") : t("list.emptyState")}
              </p>
              {!q && !status && (
                <Link href="/quotes/new" className={buttonVariants({ variant: "outline" })}>
                  {t("list.emptyCta")}
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.columns.number")}</TableHead>
                  <TableHead>{t("list.columns.client")}</TableHead>
                  <TableHead>{t("list.columns.service")}</TableHead>
                  <TableHead>{t("list.columns.amount")}</TableHead>
                  <TableHead>{t("list.columns.validity")}</TableHead>
                  <TableHead>{t("list.columns.status")}</TableHead>
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
                      <Badge variant={statusVariant[q.status]}>
                        {tc(`quoteStatus.${q.status}` as "quoteStatus.DRAFT")}
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
