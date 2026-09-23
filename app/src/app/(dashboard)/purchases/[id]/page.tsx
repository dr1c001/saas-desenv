import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getNotasDaCompra } from "@/actions/notas-compra"
import { NotasDaCompra } from "@/components/notas/notas-da-compra"
import { getCompra } from "@/actions/compras"
import { faltaReceber, podeCancelar, type StatusCompra } from "@/lib/compras"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RecebimentoForm } from "@/components/purchases/recebimento-form"
import { CancelarCompraButton } from "@/components/purchases/cancelar-compra-button"

const COR: Record<StatusCompra, "default" | "secondary" | "destructive" | "outline"> = {
  RASCUNHO: "secondary",
  ENVIADA: "default",
  PARCIAL: "outline",
  RECEBIDA: "secondary",
  CANCELADA: "destructive",
}

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await getTenant()
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { id } = await params
  const compra = await getCompra(id)
  if (!compra) notFound()

  const t = await getTranslations("compras")
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const notas = await getNotasDaCompra(id)
  const status = compra.status as StatusCompra
  const aberta = status === "ENVIADA" || status === "PARCIAL" || status === "RASCUNHO"

  const itens = compra.items.map((i) => ({
    id: i.id,
    nome: i.part.name,
    sku: i.part.sku,
    unidade: i.part.unit,
    pedido: Number(i.quantity),
    recebido: Number(i.receivedQuantity),
    custo: Number(i.unitCost),
    total: Number(i.total),
  }))

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/purchases" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("voltar")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">#{String(compra.number).padStart(4, "0")}</h1>
          <p className="text-sm text-muted-foreground">
            {compra.supplier?.name ?? t("semFornecedor")}
            {compra.expectedAt && ` · ${t("previsaoEm", { data: formatDate(compra.expectedAt) })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={COR[status]}>{t(`status.${status}` as "status.ENVIADA")}</Badge>
          {isAdmin && podeCancelar(status) && <CancelarCompraButton id={compra.id} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("itensDaCompra")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium">{t("colunas.peca")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("colunas.pedido")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("colunas.recebido")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("colunas.falta")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("colunas.custoUnit")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("colunas.total")}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const falta = faltaReceber({ pedido: i.pedido, recebido: i.recebido })
                  return (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium">{i.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.sku ? `${i.sku} · ` : ""}{i.unidade}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{i.pedido}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{i.recebido}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${falta > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                        {falta || "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(i.custo)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(i.total)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-4 py-2" colSpan={5}>{t("total")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCurrency(Number(compra.total))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {compra.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("observacao")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{compra.notes}</p></CardContent>
        </Card>
      )}

      {isAdmin && aberta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("receber")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("receberAjuda")}</p>
          </CardHeader>
          <CardContent>
            <RecebimentoForm compraId={compra.id} itens={itens} />
          </CardContent>
        </Card>
      )}

      {compra.receivedAt && (
        <p className="text-xs text-muted-foreground">
          {t("recebidaEm", { data: formatDate(compra.receivedAt) })}
        </p>
      )}
      {/* A nota do fornecedor. Fica no fim porque e o ultimo passo do
          recebimento — a peca chegou, o dinheiro virou despesa, e o papel
          que prova as duas coisas entra aqui. */}
      <NotasDaCompra purchaseOrderId={compra.id} notas={notas} podeAnexar={isAdmin} />

    </div>
  )
}
