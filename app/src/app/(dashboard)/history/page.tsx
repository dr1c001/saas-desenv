import Link from "next/link"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
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

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DONE: "outline",
  INVOICED: "default",
  CANCELLED: "destructive",
}

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const t = await getTranslations("history")
  const tCommon = await getTranslations("common")
  // Default to completed/invoiced/cancelled if no filter selected
  const effectiveStatus = status || undefined
  const orders = await getServiceOrders({
    q,
    status: effectiveStatus,
    statusIn: effectiveStatus ? undefined : ["DONE", "INVOICED", "CANCELLED"],
  })

  const statusOptions = [
    { value: "DONE", label: tCommon("serviceOrderStatus.DONE") },
    { value: "INVOICED", label: tCommon("serviceOrderStatus.INVOICED") },
    { value: "CANCELLED", label: tCommon("serviceOrderStatus.CANCELLED") },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("list.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("list.subtitle")}</p>
        </div>
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
            {t("list.countRecords", { count: orders.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <History className="size-8" />
              <p className="text-sm">{t("list.emptyNone")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.columns.number")}</TableHead>
                  <TableHead>{t("list.columns.title")}</TableHead>
                  <TableHead>{t("list.columns.client")}</TableHead>
                  <TableHead>{t("list.columns.responsible")}</TableHead>
                  <TableHead>{t("list.columns.total")}</TableHead>
                  <TableHead>{t("list.columns.concludedAt")}</TableHead>
                  <TableHead>{t("list.columns.status")}</TableHead>
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
                      <Badge variant={statusVariant[os.status] ?? "secondary"}>
                        {tCommon(`serviceOrderStatus.${os.status}` as "serviceOrderStatus.OPEN")}
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
