import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getPecas } from "@/actions/estoque"
import { getLocais } from "@/actions/estoque-locais"
import { prisma } from "@/lib/prisma"
import { situacaoDa } from "@/lib/estoque"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { SearchBar } from "@/components/shared/search-bar"
import { StatusFilter } from "@/components/shared/status-filter"
import { PecaDialog } from "@/components/parts/peca-dialog"
import { MovimentoDialog } from "@/components/parts/movimento-dialog"
import { LocaisCard, type LocalNaTela } from "@/components/parts/locais-card"
import { OndeEstaDialog } from "@/components/parts/onde-esta-dialog"
import { HistoricoDialog } from "@/components/parts/historico-dialog"
import { AlertTriangle, PackageX } from "lucide-react"

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; local?: string }>
}) {
  const { tenantId, role } = await getTenant()
  // A aba já some do menu sem o recurso (getAllowedTabs), mas a URL continua
  // digitável — menu escondido não é proteção.
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { q, local } = await searchParams
  const t = await getTranslations("estoque")
  const isAdmin = role === "OWNER" || role === "ADMIN"
  // Em paralelo: as três consultas são independentes, e somadas em série
  // atrasariam a tela pelo mais lento de cada uma.
  const [pecas, locais, equipe] = await Promise.all([
    getPecas(q, local),
    getLocais(),
    // Só para dizer de quem é a van. Nome e id, nada mais.
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])
  // Só os ativos entram nas escolhas: gravar num local desativado esconderia
  // o saldo assim que fosse gravado.
  const locaisAtivos = locais.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name }))
  // O nome do setor filtrado. Vem da lista já carregada — um id que não é
  // desta empresa simplesmente não acha nome, e a consulta já não devolveu
  // peça nenhuma por causa do `location: { tenantId }` no filtro.
  const localFiltrado = local ? locais.find((l) => l.id === local) : null

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

      {/* Os LOCAIS antes da lista de peças: a primeira coisa que quem abre
          esta tela precisa entender é que agora existe "onde", e não só
          "quanto". */}
      <LocaisCard locais={locais as unknown as LocalNaTela[]} tecnicos={equipe} isAdmin={isAdmin} />

      {/* O alerta vem antes da lista: quem abre esta tela quer saber o que
          está faltando, não navegar por um catálogo.

          Some quando há filtro. "3 peças precisam de atenção" é uma afirmação
          sobre a EMPRESA — o mínimo é comparado com o saldo total —, e contá-la
          sobre um recorte diria um número menor com as mesmas palavras. */}
      {emAlerta.length > 0 && !q && !local && (
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

      {/* Busca e setor lado a lado: "o que tem na expedição" e "onde está a
          mangueira" são a mesma pergunta feita de dois jeitos, e quem procura
          costuma querer cruzar as duas. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <SearchBar placeholder={t("buscar")} />
        </div>
        {locaisAtivos.length > 0 && (
          <StatusFilter
            paramKey="local"
            placeholder={t("todosOsLocais")}
            options={locaisAtivos.map((l) => ({ value: l.id, label: l.name }))}
          />
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {pecas.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {local ? t("vazioLocal") : q ? t("vazioBusca") : t("vazio")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium">{t("colunas.peca")}</th>
                    {/* O cabeçalho diz de QUEM é o saldo. Filtrar por setor e
                        manter escrito só "Saldo" faria a coluna parecer o total
                        da empresa. */}
                    <th className="text-right px-4 py-3 font-medium">
                      {localFiltrado ? t("noLocal", { local: localFiltrado.name }) : t("colunas.saldo")}
                    </th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.minimo")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.custo")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.venda")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("colunas.acoes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pecas.map((p) => {
                    const saldo = Number(p.stock)
                    // Com setor escolhido, a coluna mostra o saldo DAQUELE
                    // local — o total da empresa fica embaixo, em letra menor.
                    // Mostrar o total sob um filtro de setor seria a tela
                    // respondendo outra pergunta que não a feita.
                    const noLocal = localFiltrado ? Number(p.balances[0]?.quantity ?? 0) : null
                    // A situação (alerta de mínimo) continua olhando o TOTAL:
                    // o mínimo é da empresa, não do setor. Pintar de vermelho
                    // por causa de um setor com pouco criaria alarme falso em
                    // peça que está sobrando no almoxarifado ao lado.
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
                            {noLocal ?? saldo}
                          </span>
                          {situacao === "negativo" && (
                            <PackageX className="inline size-3.5 ml-1 text-destructive" />
                          )}
                          {noLocal !== null && (
                            <p className="text-xs font-normal text-muted-foreground">
                              {t("totalDaEmpresa", { q: `${saldo} ${p.unit}` })}
                            </p>
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
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Ver ONDE a peça está é leitura, e é o técnico
                                quem mais precisa — por isso fora do bloco de
                                administrador. Transferir, que mexe em saldo,
                                continua só para dono e admin (o próprio
                                diálogo decide, e a Action confere de novo). */}
                            <OndeEstaDialog
                              partId={p.id}
                              nome={p.name}
                              unidade={p.unit}
                              podeTransferir={isAdmin}
                            />
                            {/* O histórico também é leitura, e é o técnico
                                quem mais precisa dele: "quem tirou as quatro
                                que faltam" é a pergunta que ele faz primeiro. */}
                            <HistoricoDialog partId={p.id} nome={p.name} unidade={p.unit} />
                          </div>
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1.5">
                              <MovimentoDialog
                                partId={p.id}
                                nome={p.name}
                                unidade={p.unit}
                                saldo={saldo}
                                locais={locaisAtivos}
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
