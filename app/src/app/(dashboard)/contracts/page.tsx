import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { CalendarSync } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getContratos } from "@/actions/contracts"
import { ContractForm } from "@/components/contracts/contract-form"
import { ContractRowActions } from "@/components/contracts/contract-row-actions"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function ContractsPage() {
  const { tenantId, role } = await getTenant()
  // Contrato define faturamento recorrente — decisão comercial, não de campo.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const t = await getTranslations("contratos")
  const [contratos, clientes, tecnicos] = await Promise.all([
    getContratos(),
    prisma.client.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
      </div>

      <ContractForm clientes={clientes} tecnicos={tecnicos} />

      {clientes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("needClient")}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("listTitle", { count: contratos.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {contratos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CalendarSync className="size-8" />
              <p className="text-sm">{t("empty")}</p>
              <p className="text-xs max-w-md text-center">{t("emptyHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.contract")}</TableHead>
                  <TableHead>{t("columns.frequency")}</TableHead>
                  <TableHead>{t("columns.next")}</TableHead>
                  <TableHead>{t("columns.amount")}</TableHead>
                  <TableHead>{t("columns.generated")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((c) => (
                  <TableRow key={c.id} className={c.active ? "" : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{c.title}</p>
                      <Link href={`/clients/${c.client.id}`} className="text-xs text-muted-foreground hover:underline">
                        {c.client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t(`frequencies.${c.frequency}` as "frequencies.WEEKLY")}
                      {!c.active && (
                        <Badge variant="secondary" className="ml-2">{t("paused")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.active ? formatDate(c.nextRunAt) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatCurrency(Number(c.amount))}</TableCell>
                    <TableCell className="text-sm">{c._count.orders}</TableCell>
                    <TableCell className="text-right">
                      <ContractRowActions id={c.id} ativo={c.active} osGeradas={c._count.orders} />
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
