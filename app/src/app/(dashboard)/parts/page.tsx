import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getPecas } from "@/actions/estoque"
import { situacaoDa } from "@/lib/estoque"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { SearchBar } from "@/components/shared/search-bar"
import { PecaDialog } from "@/components/parts/peca-dialog"
import { MovimentoDialog } from "@/components/parts/movimento-dialog"
import { AlertTriangle, PackageX } from "lucide-react"

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { tenantId, role } = await getTenant()
  // A aba já some do menu sem o recurso (getAllowedTabs), mas a URL continua
  // digitável — menu escondido não é proteção.
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { q } = await searchParams
  const t = await getTranslations("estoque")
  const pecas = await getPecas(q)
  const isAdmin = role === "OWNER" || role === "ADMIN"

  const emAlerta = pecas.filter(
    (p) => p.active && situacaoDa(Number(p.stock), Number(p.minStock)) !== "ok"
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isAdmin && <PecaDialog />}
      </div>

      {/* O alerta vem antes da lista: quem abre esta tela quer saber o que
          está faltando, não navegar por um catálogo. */}
      {emAlerta.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber-600" />
              {t("alerta.titulo", { count: emAlerta.length })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {emAlerta.map((p) => p.name).join(" · ")}
            </p>
          </CardContent>
        </Card>
      )}

      <SearchBar placeholder={t("buscar")} />

      <Card>
        <CardContent className="p-0">
          {pecas.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q ? t("vazioBusca") : t("vazio")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.peca")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.saldo")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.minimo")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.custo")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.venda")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.acoes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pecas.map((p) => {
                    const saldo = Number(p.stock)
                    const situacao = situacaoDa(saldo, Number(p.minStock))
                    return (
                      <tr key={p.id} className={`border-b last:border-0 ${!p.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.sku ? `${p.sku} · ` : ""}
                            {p.unit}
                            {!p.active && ` · ${t("inativa")}`}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span
                            className={
                              situacao === "negativo"
                                ? "font-semibold text-destructive"
                                : situacao === "abaixo"
                                  ? "font-semibold text-amber-600"
                                  : ""
                            }
                          >
                            {saldo}
                          </span>
                          {situacao === "negativo" && (
                            <PackageX className="inline size-3.5 ml-1 text-destructive" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {Number(p.minStock) || "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {p.costPrice ? formatCurrency(Number(p.costPrice)) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.salePrice ? formatCurrency(Number(p.salePrice)) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1.5">
                              <MovimentoDialog
                                partId={p.id}
                                nome={p.name}
                                unidade={p.unit}
                                saldo={saldo}
                              />
                              <PecaDialog
                                peca={{
                                  id: p.id,
                                  name: p.name,
                                  sku: p.sku,
                                  unit: p.unit,
                                  costPrice: p.costPrice ? Number(p.costPrice) : null,
                                  salePrice: p.salePrice ? Number(p.salePrice) : null,
                                  minStock: Number(p.minStock),
                                  active: p.active,
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
