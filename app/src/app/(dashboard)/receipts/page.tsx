import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Receipt } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"
import { ReceiptPdfButton } from "@/components/receipts/receipt-pdf-button"
import { SearchBar } from "@/components/shared/search-bar"

async function getReceipts(tenantId: string, q?: string) {
  return prisma.revenue.findMany({
    where: {
      tenantId,
      status: "PAID",
      ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { order: { select: { number: true, createdAt: true, title: true } } },
    orderBy: { paidAt: "desc" },
  })
}

type SearchParams = Promise<{ q?: string }>

export default async function ReceiptsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const t = await getTranslations("billingReferral.receipts")
  const { tenantId } = await getTenant()
  const receipts = await getReceipts(tenantId, q)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Suspense>
        <SearchBar placeholder={t("searchPlaceholder")} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("countLabel", { count: receipts.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Receipt className="size-8" />
              <p className="text-sm">{t("empty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.description")}</TableHead>
                  <TableHead>{t("columns.amount")}</TableHead>
                  <TableHead>{t("columns.dueDate")}</TableHead>
                  <TableHead>{t("columns.paidAt")}</TableHead>
                  <TableHead>{t("columns.linkedOrder")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.description}</TableCell>
                    <TableCell className="font-semibold text-green-700">{formatCurrency(Number(r.amount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.dueDate)}</TableCell>
                    <TableCell className="text-sm">{r.paidAt ? formatDate(r.paidAt) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.order ? (
                        <span className="font-mono">
                          {formatOsNumber(r.order.number, r.order.createdAt)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ReceiptPdfButton revenueId={r.id} />
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
