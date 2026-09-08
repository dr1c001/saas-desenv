import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getComparacao } from "@/actions/cotacao"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PrecosDialog } from "@/components/cotacoes/precos-dialog"
import { FecharCotacaoButton } from "@/components/cotacoes/fechar-cotacao-button"
import { Trophy, TriangleAlert } from "lucide-react"

// A tela que dá o valor todo da cotação: a COMPARAÇÃO.
//
// Mostra as duas respostas certas lado a lado — o melhor fornecedor único e o
// total comprando cada item de quem está mais barato — porque elas divergem, e
// a diferença entre elas é exatamente o que o dono está comprando ao aceitar
// dividir o pedido em três entregas.

export default async function CotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await getTenant()
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { id } = await params
  const dados = await getComparacao(id)
  if (!dados) notFound()

  const { cotacao: c, comparacao: cmp } = dados
  const t = await getTranslations("cotacoes")
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const aberta = c.status === "ABERTA"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          <span className="font-mono text-muted-foreground">
            #{String(c.number).padStart(4, "0")}
          </span>{" "}
          {c.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(`status.${c.status}` as "status.ABERTA")}
          {c.deadline && ` · ${t("prazo")}: ${c.deadline.toLocaleDateString("pt-BR")}`}
        </p>
      </div>

      {/* ─── O resultado, ANTES da tabela ────────────────────────────────
          Quem abre esta tela quer a resposta, e não os dados brutos para
          calcular de novo. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Trophy className="size-4" />
              {t("melhorUnico")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cmp.melhorUnico ? (
              <>
                <p className="text-lg font-semibold">{cmp.melhorUnico.participante.nome}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrency(cmp.melhorUnico.total)}
                </p>
              </>
            ) : (
              // Sem ninguém completo não há comparação por total — e inventar
              // um vencedor com quem cotou metade daria a vitória a quem
              // respondeu menos.
              <p className="text-sm text-muted-foreground">{t("semUnico")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalDividindo")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(cmp.totalDividindo)}</p>
            {cmp.economiaAoDividir !== null && cmp.economiaAoDividir > 0 && (
              <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {t("economia")}: {formatCurrency(cmp.economiaAoDividir)}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t("explicaDividir")}</p>
          </CardContent>
        </Card>
      </div>

      {cmp.semCotacao.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{t("semCotacao", { itens: cmp.semCotacao.map((i) => i.nome).join(", ") })}</span>
          </CardContent>
        </Card>
      )}

      {/* ─── A tabela: itens nas linhas, fornecedores nas colunas ───────── */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">{t("peca")}</th>
                <th className="p-3 text-right font-semibold">{t("quantidade")}</th>
                {c.participants.map((p) => (
                  <th key={p.id} className="p-3 text-right font-semibold">
                    {p.supplier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cmp.porItem.map((linha) => (
                <tr key={linha.item.id} className="border-t">
                  <td className="p-3">{linha.item.nome}</td>
                  <td className="p-3 text-right tabular-nums">{linha.item.quantidade}</td>
                  {c.participants.map((p) => {
                    const preco = p.prices.find((x) => x.itemId === linha.item.id)
                    const venceu = linha.participantId === p.id
                    return (
                      <td
                        key={p.id}
                        className={`p-3 text-right tabular-nums ${
                          venceu ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""
                        }`}
                      >
                        {preco ? formatCurrency(Number(preco.unitPrice)) : t("naoCotou")}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="p-3" colSpan={2}>
                  Total
                </td>
                {cmp.totais.map((tot) => (
                  <td key={tot.participante.id} className="p-3 text-right tabular-nums">
                    {tot.cotados > 0 ? formatCurrency(tot.total) : t("naoCotou")}
                    {/* Quem cotou só parte precisa aparecer marcado: o total
                        dele é menor porque respondeu menos, não porque está
                        mais barato. */}
                    {!tot.completo && tot.cotados > 0 && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {t("cotou", { n: tot.cotados, total: cmp.porItem.length })}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ─── Ações por fornecedor ───────────────────────────────────────── */}
      {isAdmin && (
        <div className="grid gap-2 sm:grid-cols-2">
          {c.participants.map((p) => {
            const tot = cmp.totais.find((x) => x.participante.id === p.id)!
            return (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.respondedAt ? t("respondeu") : t("naoRespondeu")} ·{" "}
                      {t("cotou", { n: tot.cotados, total: cmp.porItem.length })}
                    </p>
                  </div>
                  {aberta && (
                    <PrecosDialog
                      participantId={p.id}
                      nome={p.supplier.name}
                      itens={cmp.porItem.map((i) => ({
                        id: i.item.id,
                        nome: i.item.nome,
                        quantidade: i.item.quantidade,
                        atual:
                          p.prices.find((x) => x.itemId === i.item.id)?.unitPrice.toString() ?? "",
                      }))}
                      observacoes={p.notes ?? ""}
                    />
                  )}
                  {/* Fechar só com quem cotou algo: gerar ordem de compra de
                      quem não respondeu criaria uma compra vazia. */}
                  {aberta && tot.cotados > 0 && (
                    <FecharCotacaoButton quotationId={c.id} participantId={p.id} />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
