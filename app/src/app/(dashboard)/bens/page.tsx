import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getBens, getResumoDoPatrimonio } from "@/actions/patrimonio"
import { getLocais } from "@/actions/estoque-locais"
import { temRecurso } from "@/lib/plan"
import { prisma } from "@/lib/prisma"
import { formatCurrency } from "@/lib/utils"
import { paraCampo } from "@/lib/dinheiro"
import { Card, CardContent } from "@/components/ui/card"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { BemDialog } from "@/components/bens/bem-dialog"
import { BemAcoes } from "@/components/bens/bem-acoes"
import { ExportarPatrimonio } from "@/components/bens/exportar-patrimonio"
import { Info } from "lucide-react"

// O controle de bens.
//
// O que a empresa TEM: a van, a rotativa, o notebook, a bancada. Não é peça de
// estoque (comprada para aplicar no serviço) nem equipamento de cliente (que
// nem é dela) — são três coisas com cara parecida e naturezas opostas.

const COR: Record<string, string> = {
  ATIVO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  MANUTENCAO: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  BAIXADO: "bg-muted text-muted-foreground",
}

export default async function BensPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { tenantId, role } = await getTenant()
  const { q, status } = await searchParams
  const t = await getTranslations("bens")
  const isAdmin = role === "OWNER" || role === "ADMIN"

  // Os locais só existem com o recurso de estoque. Sem ele, o bem ainda tem
  // responsável — a pergunta "com quem está" não depende de almoxarifado.
  const temEstoque = await temRecurso(tenantId, "stock")

  const [bens, resumo, locais, equipe] = await Promise.all([
    getBens({ q, situacao: status }),
    getResumoDoPatrimonio(),
    temEstoque ? getLocais() : Promise.resolve([]),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  const paraDialogo = {
    locais: locais.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name })),
    equipe,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("titulo")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <ExportarPatrimonio />
            <BemDialog {...paraDialogo} />
          </div>
        )}
      </div>

      {/* ─── O resumo, antes da lista ────────────────────────────────────
          Quem abre esta tela na hora do balanço quer os quatro números, e
          não navegar por um inventário. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo={t("resumo.quantidade")} valor={String(resumo.quantidade)} />
        <Resumo rotulo={t("resumo.aquisicao")} valor={formatCurrency(resumo.totalAquisicao)} />
        <Resumo
          rotulo={t("resumo.depreciado")}
          valor={formatCurrency(resumo.totalDepreciado)}
          tom="text-muted-foreground"
        />
        <Resumo
          rotulo={t("resumo.contabil")}
          valor={formatCurrency(resumo.totalContabil)}
          tom="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* O limite honesto, dito na tela e não só na documentação. */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="flex items-start gap-2 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <span>{t("avisoContador")}</span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <SearchBar placeholder={t("busca")} />
        {/* Sem opção "todas" própria: o StatusFilter já injeta a dele ("ALL"),
            e as duas juntas mostravam "Todos" repetido no mesmo menu. */}
        <StatusFilter
          placeholder={t("filtro.todas")}
          options={[
            { value: "ATIVO", label: t("filtro.ATIVO") },
            { value: "MANUTENCAO", label: t("filtro.MANUTENCAO") },
            { value: "BAIXADO", label: t("filtro.BAIXADO") },
          ]}
        />
      </div>

      {bens.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q || status ? t("vazioBusca") : t("vazio")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">{t("nome")}</th>
                  <th className="p-3 font-semibold">{t("local")}</th>
                  <th className="p-3 text-right font-semibold">{t("valor")}</th>
                  <th className="p-3 text-right font-semibold">{t("depreciacao")}</th>
                  <th className="p-3 text-right font-semibold">{t("resumo.contabil")}</th>
                  {isAdmin && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {bens.map((b) => (
                  <tr key={b.id} className={`border-t ${b.status === "BAIXADO" ? "opacity-60" : ""}`}>
                    <td className="p-3">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`categorias.${b.category}` as "categorias.OUTRO")}
                        {b.brand && ` · ${b.brand}`}
                        {b.serialNumber && ` · ${b.serialNumber}`}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${COR[b.status]}`}
                      >
                        {t(`situacoes.${b.status}` as "situacoes.ATIVO")}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {b.location?.name ?? t("semLocal")}
                      {b.responsible && <span className="block">{b.responsible.name}</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatCurrency(b.purchaseValue)}
                      <span className="block text-[11px] text-muted-foreground">
                        {b.purchasedAt.toLocaleDateString("pt-BR")}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(b.depreciado)}
                      <span className="block text-[11px]">{b.taxa}%/ano</span>
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatCurrency(b.contabil)}
                    </td>
                    {isAdmin && (
                      <td className="p-3">
                        <BemAcoes
                          bem={{
                            id: b.id,
                            name: b.name,
                            category: b.category,
                            brand: b.brand,
                            model: b.model,
                            serialNumber: b.serialNumber,
                            purchaseValue: b.purchaseValue,
                            purchasedAt: b.purchasedAt.toISOString().slice(0, 10),
                            // A taxa é porcentagem e `lerTaxa` não mexe em
                            // ponto — String basta. O RESIDUAL é dinheiro, e
                            // aí `String` sairia com ponto decimal, que o
                            // parser lia como milhar. Ver lib/dinheiro.ts.
                            annualRate: b.annualRate === null ? "" : String(b.annualRate),
                            residualValue: paraCampo(
                              b.residualValue === null ? null : Number(b.residualValue)
                            ),
                            locationId: b.locationId,
                            responsibleId: b.responsibleId,
                            notes: b.notes,
                            status: b.status,
                          }}
                          {...paraDialogo}
                          podeExcluir={role === "OWNER" && b._count.maintenance === 0}
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

function Resumo({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${tom ?? ""}`}>{valor}</p>
      </CardContent>
    </Card>
  )
}
