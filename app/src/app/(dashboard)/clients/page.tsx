import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, User, Eye, Pencil } from "lucide-react"
import { getClients } from "@/actions/clients"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { getTranslations } from "next-intl/server"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  DEFAULTER: "destructive",
}

type SearchParams = Promise<{ q?: string; status?: string }>

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status } = await searchParams
  const clients = await getClients({ q, status })
  const t = await getTranslations("clients")
  const tc = await getTranslations("common")

  const statusOptions = [
    { value: "ACTIVE", label: tc("clientStatus.ACTIVE") },
    { value: "INACTIVE", label: tc("clientStatus.INACTIVE") },
    { value: "DEFAULTER", label: tc("clientStatus.DEFAULTER") },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("list.title")}</h1>
        <Link href="/clients/new" className={buttonVariants()}>
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
              ? t("list.resultsFound", { count: clients.length })
              : t("list.resultsCount", { count: clients.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <User className="size-8" />
              <p className="text-sm">
                {q || status ? t("list.emptyFiltered") : t("list.emptyState")}
              </p>
              {!q && !status && (
                <Link href="/clients/new" className={buttonVariants({ variant: "outline" })}>
                  {t("list.emptyCta")}
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.columns.name")}</TableHead>
                  <TableHead>{t("list.columns.document")}</TableHead>
                  <TableHead>{t("list.columns.phone")}</TableHead>
                  <TableHead>{t("list.columns.serviceOrders")}</TableHead>
                  <TableHead>{t("list.columns.status")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.document || "—"}</TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{c._count.serviceOrders}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status]}>
                        {tc(`clientStatus.${c.status}` as "clientStatus.ACTIVE")}
                      </Badge>
                    </TableCell>
                    {/* Antes só o nome era clicável, sem nenhuma indicação — quem
                        cadastrou um dado errado não tinha como saber que dava pra
                        corrigir. (Pedido do usuário em 10/08/2026.) */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/clients/${c.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Eye className="size-3.5 mr-1.5" />
                          {tc("view")}
                        </Link>
                        <Link
                          href={`/clients/${c.id}/edit`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <Pencil className="size-3.5 mr-1.5" />
                          {tc("edit")}
                        </Link>
                      </div>
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
