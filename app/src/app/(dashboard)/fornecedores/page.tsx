import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Plus, Truck } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { getFornecedores } from "@/actions/fornecedores"
import { formatarDocumento } from "@/lib/documento"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { FornecedorAcoes } from "@/components/fornecedores/fornecedor-acoes"

// Os FORNECEDORES — quem vende peça e material para a empresa.
//
// Não confundir com PRESTADOR (/providers), que presta serviço PARA ela. São
// dois cadastros de propósito: o fornecedor entra em compra e cotação, o
// prestador entra em manutenção.
//
// Antes desta tela o fornecedor vivia num diálogo dentro de Compras, onde só
// dava para criar e apagar — corrigir um telefone errado exigia apagar e
// cadastrar de novo, e apagar levava junto o histórico de cotações.

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { role } = await getTenant()
  const { q, status } = await searchParams
  const t = await getTranslations("fornecedores")
  const isAdmin = role === "OWNER" || role === "ADMIN"

  const fornecedores = await getFornecedores({ q, situacao: status })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("titulo")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {isAdmin && (
          <Button size="sm" render={<Link href="/fornecedores/novo" />}>
            <Plus className="size-4 mr-1.5" />
            {t("novo")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchBar placeholder={t("busca")} />
        <StatusFilter
          placeholder={t("filtro.todos")}
          options={[
            { value: "ATIVO", label: t("filtro.ATIVO") },
            { value: "INATIVO", label: t("filtro.INATIVO") },
          ]}
        />
      </div>

      {fornecedores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Truck className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q || status ? t("vazioBusca") : t("vazio")}
            </p>
            {isAdmin && !q && !status && (
              <Button size="sm" variant="outline" render={<Link href="/fornecedores/novo" />}>
                {t("novo")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">{t("colunas.fornecedor")}</th>
                  <th className="p-3 font-semibold">{t("colunas.contato")}</th>
                  <th className="p-3 font-semibold">{t("colunas.condicoes")}</th>
                  <th className="p-3 text-right font-semibold">{t("colunas.historico")}</th>
                  {isAdmin && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} className={`border-t ${f.active ? "" : "opacity-60"}`}>
                    <td className="p-3">
                      <Link href={`/fornecedores/${f.id}`} className="font-medium hover:underline">
                        {f.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[f.category, f.document ? formatarDocumento(f.document) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {!f.active && (
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t("inativo")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {f.contactName && <span className="block">{f.contactName}</span>}
                      {f.contactPhone ?? f.phone}
                      {f.city && <span className="block">{[f.city, f.state].filter(Boolean).join("/")}</span>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {f.paymentTerms}
                      {f.leadTimeDays !== null && (
                        <span className="block">{t("prazoDias", { dias: f.leadTimeDays })}</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs tabular-nums text-muted-foreground">
                      {t("compras", { n: f._count.purchaseOrders })}
                      <span className="block">{t("cotacoes", { n: f._count.quotations })}</span>
                    </td>
                    {isAdmin && (
                      <td className="p-3">
                        <FornecedorAcoes
                          id={f.id}
                          ativo={f.active}
                          temHistorico={f._count.purchaseOrders > 0 || f._count.quotations > 0}
                          podeExcluir={role === "OWNER"}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
