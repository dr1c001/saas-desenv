import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getVocabulario } from "@/actions/vocabulario"
import { VocabularioForm } from "@/components/settings/vocabulario-form"

export default async function VocabularyPage() {
  const { role } = await getTenant()
  // Como o sistema se chama muda para toda a equipe de uma vez.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const t = await getTranslations("vocabulario")
  const atual = await getVocabulario()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <VocabularioForm atual={atual} />
    </div>
  )
}
