import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getNotas } from "@/actions/notas-compra"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { SearchBar } from "@/components/shared/search-bar"
import { ApagarNotaButton } from "@/components/notas/apagar-nota-button"
import { FileText, ExternalLink } from "lucide-react"

// A aba das notas do fornecedor.
//
// A nota dentro da compra resolve "onde está a nota DESTA compra". Não resolve
// a pergunta que o dono faz de verdade meses depois: "onde está a nota daquele
// compressor que comprei em março?" — para isso é preciso ver todas num lugar
// só, com busca. É também o que o contador pede, e o que hoje sai de uma caixa
// de papel.

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { tenantId, role } = await getTenant()
  // A aba já some do menu sem o recurso, mas a URL continua digitável — menu
  // escondido não é proteção.
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const { q } = await searchParams
  const t = await getTranslations("notasCompra")
  const notas = await getNotas(q)
  const isAdmin = role === "OWNER" || role === "ADMIN"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitulo")}</p>
      </div>

      <SearchBar placeholder={t("busca")} />

      {notas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q ? t("vazioBusca") : t("vazio")}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notas.map((n) => (
            <li key={n.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      <Link
                        href={`/purchases/${n.compra.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {t("daCompra", { n: n.compra.number })}
                      </Link>
                      {" · "}
                      {n.compra.fornecedor ?? t("semFornecedor")}
                      {" · "}
                      {formatCurrency(n.compra.total)}
                      {" · "}
                      {n.criadaEm.toLocaleDateString("pt-BR")}
                    </p>
                  </div>

                  {/* `link` nulo = o caminho não pertence a esta empresa. Não
                      deveria acontecer, e se acontecer é melhor mostrar
                      "indisponível" do que um link para arquivo alheio. */}
                  {n.link ? (
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 text-sm underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="size-4" />
                      {t("abrir")}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("indisponivel")}
                    </span>
                  )}

                  {isAdmin && <ApagarNotaButton notaId={n.id} />}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
