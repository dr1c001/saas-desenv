import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, HardHat } from "lucide-react"
import { getProviders } from "@/actions/providers"
import { SearchBar } from "@/components/shared/search-bar"
import { DeleteButton } from "@/components/shared/delete-button"
import { deleteProvider } from "@/actions/providers"
import { getTranslations } from "next-intl/server"

type SearchParams = Promise<{ q?: string }>

export default async function ProvidersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const providers = await getProviders(q)
  const t = await getTranslations("providers")
  const tc = await getTranslations("common")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("list.title")}</h1>
        <Link href="/providers/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          {t("list.newButton")}
        </Link>
      </div>

      <Suspense>
        <SearchBar placeholder={t("list.searchPlaceholder")} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("list.resultsCount", { count: providers.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {providers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <HardHat className="size-8" />
              <p className="text-sm">{q ? t("list.emptyFiltered") : t("list.emptyState")}</p>
              {!q && (
                <Link href="/providers/new" className={buttonVariants({ variant: "outline" })}>
                  {t("list.emptyCta")}
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.columns.name")}</TableHead>
                  <TableHead>{t("list.columns.specialty")}</TableHead>
                  <TableHead>{t("list.columns.phone")}</TableHead>
                  <TableHead>{t("list.columns.email")}</TableHead>
                  <TableHead>{t("list.columns.document")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.specialty ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.document ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/providers/${p.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {tc("edit")}
                        </Link>
                        <DeleteButton action={deleteProvider.bind(null, p.id)} label={t("list.deleteButton")} />
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
