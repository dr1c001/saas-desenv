import Link from "next/link"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, ClipboardList } from "lucide-react"
import { getServiceOrders } from "@/actions/service-orders"
import { getAcoesPermitidas, getTenant } from "@/lib/auth"
import { podeFazer } from "@/lib/acoes"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { filiaisAtivas } from "@/actions/filiais"
import { formatCurrency, formatOsNumber } from "@/lib/utils"
import { OsActionsRow } from "@/components/service-orders/os-actions-row"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "secondary",
  IN_PROGRESS: "default",
  DONE: "outline",
  INVOICED: "outline",
  CANCELLED: "destructive",
}

type SearchParams = Promise<{ q?: string; status?: string; filial?: string }>

export default async function ServiceOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status, filial } = await searchParams
  const t = await getTranslations("serviceOrdersPages")
  const tCommon = await getTranslations("common")
  const tFil = await getTranslations("filiais.filtro")
  // O padrão é mostrar só as ativas; "all" mostra tudo.
  //
  // `activeOnly` era calculado e nunca usado — a única validação de status
  // desta tela estava desligada, e um link velho ou digitado errado
  // (?status=ABERTO) entregava a string crua ao Prisma como enum inválido, em
  // vez de cair no padrão que o comentário prometia. Agora ela DECIDE.
  // (Achado em auditoria, 21/08/2026.)
  const STATUS_CONHECIDOS = ["DONE", "INVOICED", "CANCELLED", "OPEN", "IN_PROGRESS"]
  const statusValido = status === "all" || (!!status && STATUS_CONHECIDOS.includes(status))
  const activeOnly = !statusValido || status === undefined

  const [orders, filiais] = await Promise.all([
    getServiceOrders({
      q,
      status: statusValido && status !== "all" ? status : undefined,
      statusIn: activeOnly ? ["OPEN", "IN_PROGRESS"] : undefined,
      filial,
    }),
    filiaisAtivas(),
  ])

  // Uma consulta só, e não uma por linha da tabela: a lista pode ter cem OS.
  const { tenantId, role } = await getTenant()
  const permitidas = await getAcoesPermitidas(tenantId, role)
  const pode = (acao: Parameters<typeof podeFazer>[2]) => podeFazer(role, permitidas, acao)

  const statusOptions = [
    { value: "all", label: t("list.statusAll") },
    { value: "OPEN", label: tCommon("serviceOrderStatus.OPEN") },
    { value: "IN_PROGRESS", label: tCommon("serviceOrderStatus.IN_PROGRESS") },
    { value: "DONE", label: tCommon("serviceOrderStatus.DONE") },
    { value: "INVOICED", label: tCommon("serviceOrderStatus.INVOICED") },
    { value: "CANCELLED", label: tCommon("serviceOrderStatus.CANCELLED") },
  ]

  // Mesma logica original (flags independentes: vazio nunca ocorre pois
  // isFilteredView é sempre true quando isActiveView é false) — só trocamos
  // a concatenação de palavras soltas por frases completas traduzidas, já
  // que em inglês o adjetivo vem antes do substantivo ("3 active orders").
  const isActiveView = !status || status === ""
  const isFilteredView = !!(q || (status && status !== ""))
  const countText = isActiveView && isFilteredView
    ? t("list.countActiveFound", { count: orders.length })
    : isActiveView
      ? t("list.countActive", { count: orders.length })
      : t("list.countFound", { count: orders.length })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("list.title")}</h1>
        {pode("os.criar") && (
          <Link href="/service-orders/new" className={buttonVariants()}>
            <Plus className="size-4 mr-2" />
            {t("list.newButton")}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Suspense>
          <SearchBar placeholder={t("list.searchPlaceholder")} />
          <StatusFilter options={statusOptions} placeholder={t("list.statusFilterPlaceholder")} />
          {filiais.length > 0 && (
            <StatusFilter
              paramKey="filial"
              options={filiais.map((f) => ({ value: f.id, label: f.name }))}
              placeholder={tFil("todas")}
            />
          )}
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {countText}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ClipboardList className="size-8" />
              <p className="text-sm">
                {q || status ? t("list.emptyFiltered") : t("list.emptyNone")}
              </p>
              {!q && !status && pode("os.criar") && (
                <Link href="/service-orders/new" className={buttonVariants({ variant: "outline" })}>
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
                  <TableHead>{t("list.columns.client")}</TableHead>
                  <TableHead>{t("list.columns.responsible")}</TableHead>
                  <TableHead>{t("list.columns.total")}</TableHead>
                  <TableHead>{t("list.columns.date")}</TableHead>
                  <TableHead>{t("list.columns.status")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((os) => (
                  <TableRow key={os.id}>
                    <TableCell className="font-mono font-medium text-xs">{formatOsNumber(os.number, os.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/service-orders/${os.id}`} className="hover:underline">
                        {os.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{os.client.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {os.technician?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatCurrency(Number(os.totalAmount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(os.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[os.status]}>
                        {tCommon(`serviceOrderStatus.${os.status}` as "serviceOrderStatus.OPEN")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <OsActionsRow
                        id={os.id}
                        title={os.title}
                        status={os.status}
                        conclusionNote={os.conclusionNote}
                        items={os.items.map((i) => ({
                          description: i.description,
                          quantity: Number(i.quantity),
                          unitPrice: Number(i.unitPrice),
                        }))}
                        podeStatus={pode("os.status")}
                        podeConcluir={pode("os.concluir")}
                        podeEditar={pode("os.editar")}
                      />
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
