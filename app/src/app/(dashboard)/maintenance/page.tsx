import Link from "next/link"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
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

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "secondary",
  IN_PROGRESS: "default",
  DONE: "outline",
  CANCELLED: "destructive",
}

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const orders = await getMaintenanceOrders({ q, status })
  const t = await getTranslations("maintenance")
  const tCommon = await getTranslations("common")

  const statusOptions = [
    { value: "OPEN", label: tCommon("serviceOrderStatus.OPEN") },
    { value: "IN_PROGRESS", label: tCommon("serviceOrderStatus.IN_PROGRESS") },
    { value: "DONE", label: tCommon("serviceOrderStatus.DONE") },
    { value: "CANCELLED", label: tCommon("serviceOrderStatus.CANCELLED") },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("list.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("list.subtitle")}</p>
        </div>
        <Link href="/maintenance/new" className={buttonVariants()}>
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
            {t("list.countLabel", { count: orders.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Wrench className="size-8" />
              <p className="text-sm">
                {q || status ? t("list.emptyFiltered") : t("list.emptyNone")}
              </p>
              {!q && !status && (
                <Link href="/maintenance/new" className={buttonVariants({ variant: "outline" })}>
                  {t("list.createFirst")}
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.columns.number")}</TableHead>
                  <TableHead>{t("list.columns.title")}</TableHead>
                  <TableHead>{t("list.columns.provider")}</TableHead>
                  <TableHead>{t("list.columns.total")}</TableHead>
                  <TableHead>{t("list.columns.date")}</TableHead>
                  <TableHead>{t("list.columns.status")}</TableHead>
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
                      <Badge variant={statusVariant[om.status]}>
                        {tCommon(`serviceOrderStatus.${om.status}` as "serviceOrderStatus.OPEN")}
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
