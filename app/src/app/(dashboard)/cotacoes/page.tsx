import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getCotacoes } from "@/actions/cotacao"
import { getPecasAtivas } from "@/actions/estoque"
import { getFornecedoresAtivos } from "@/actions/fornecedores"
import { Card, CardContent } from "@/components/ui/card"
import { CotacaoDialog } from "@/components/cotacoes/cotacao-dialog"
import { Scale } from "lucide-react"

const COR: Record<string, string> = {
  ABERTA: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  FECHADA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CANCELADA: "bg-muted text-muted-foreground",
}

export default async function CotacoesPage() {
  const { tenantId, role } = await getTenant()
  if (!(await temRecurso(tenantId, "stock"))) redirect("/dashboard")

  const t = await getTranslations("cotacoes")
  const [cotacoes, pecas, fornecedores] = await Promise.all([
    getCotacoes(),
    getPecasAtivas(),
    getFornecedoresAtivos(),
  ])
  const isAdmin = role === "OWNER" || role === "ADMIN"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {isAdmin && (
          <CotacaoDialog
            pecas={pecas.map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
            fornecedores={fornecedores.map((f) => ({ id: f.id, name: f.name }))}
          />
        )}
      </div>

      {cotacoes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("vazio")}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {cotacoes.map((c) => (
            <li key={c.id}>
              <Link href={`/cotacoes/${c.id}`}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex flex-wrap items-center gap-3 py-3">
                    <Scale className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <span className="font-mono">#{String(c.number).padStart(4, "0")}</span>{" "}
                        {c.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("cotou", { n: c._count.items, total: c._count.items })} ·{" "}
                        {c._count.participants} {t("fornecedores").toLowerCase()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${COR[c.status]}`}
                    >
                      {t(`status.${c.status}` as "status.ABERTA")}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
