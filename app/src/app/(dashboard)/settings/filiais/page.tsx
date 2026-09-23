import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { equipeComFilial, listarFiliais } from "@/actions/filiais"
import { FiliaisForm } from "@/components/settings/filiais-form"
import { Card, CardContent } from "@/components/ui/card"

export default async function FiliaisPage() {
  const { role, tenantId } = await getTenant()
  // Mexer em filial redesenha quem enxerga o quê na empresa inteira.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")
  if (!(await temRecurso(tenantId, "filiais"))) redirect("/billing")

  const t = await getTranslations("filiais")
  const [filiais, equipe] = await Promise.all([listarFiliais(), equipeComFilial()])

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* O que é separado e o que NÃO é, dito na tela.
          Uma empresa que acha que separou o estoque por unidade e descobre no
          inventário que não separou perdeu mais do que teria perdido se
          soubesse desde o começo. */}
      <Card>
        <CardContent className="grid gap-4 pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">{t("escopo.separado")}</p>
            <p className="mt-1 text-muted-foreground">{t("escopo.separadoLista")}</p>
          </div>
          <div>
            <p className="font-medium">{t("escopo.comum")}</p>
            <p className="mt-1 text-muted-foreground">{t("escopo.comumLista")}</p>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("escopo.semFilial")}</p>
        </CardContent>
      </Card>

      <FiliaisForm filiais={filiais} equipe={equipe} />
    </div>
  )
}
