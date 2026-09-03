import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getCompras, getSugestaoDeCompra } from "@/actions/compras"
import { getFornecedoresAtivos } from "@/actions/fornecedores"
import { getPecasAtivas } from "@/actions/estoque"
import { estaPendente, type StatusCompra } from "@/lib/compras"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SugestaoButton } from "@/components/purchases/sugestao-button"
import { CompraDialog } from "@/components/purchases/compra-dialog"
import { Truck } from "lucide-react"

const COR: Record<StatusCompra, "default" | "secondary" | "destructive" | "outline"> = {
  RASCUNHO: "secondary",
  ENVIADA: "default",
  PARCIAL: "outline",
  RECEBIDA: "secondary",
  CANCELADA: "destructive",
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { tenantId, role } = await getTenant()
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { status } = await searchParams
  const t = await getTranslations("compras")
  const faltando = await getSugestaoDeCompra()
  const [compras, fornecedores, pecas] = await Promise.all([
    getCompras(status),
    getFornecedoresAtivos(),
    getPecasAtivas(),
  ])
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const pendentes = compras.filter((c) => estaPendente(c.status as StatusCompra))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {/* Era um diálogo aqui dentro, onde só dava para criar e apagar.
                Virou tela própria (4.6), com busca, ficha e EDIÇÃO — corrigir
                um telefone errado não exige mais apagar e recadastrar. O link
                fica onde o botão estava: é onde quem já usa vai procurar. */}
            <Button size="sm" variant="outline" render={<Link href="/fornecedores" />}>
              <Truck className="size-4 mr-1.5" />
              {t("fornecedores")}
            </Button>
            <CompraDialog fornecedores={fornecedores} pecas={pecas.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              unit: p.unit,
              costPrice: p.costPrice ? Number(p.costPrice) : null,
            }))} />
        <SugestaoButton quantasFaltam={faltando.length} />
          </div>
        )}
      </div>

      {pendentes.length > 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{t("pendentes", { count: pendentes.length })}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("pendentesAjuda")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {compras.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {pecas.length === 0 ? t("vazioSemPecas") : t("vazio")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.numero")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.fornecedor")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.status")}</th>
                    <th className="text-center px-4 py-3 font-medium">{t("colunas.itens")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.previsao")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/purchases/${c.id}`} className="font-mono font-medium hover:underline">
                          #{String(c.number).padStart(4, "0")}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{c.supplier?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={COR[c.status as StatusCompra]}>
                          {t(`status.${c.status}` as "status.ENVIADA")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{c._count.items}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.expectedAt ? formatDate(c.expectedAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(Number(c.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
