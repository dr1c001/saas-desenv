import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getCustomFields } from "@/actions/custom-fields"
import { CustomFieldsManager } from "@/components/settings/custom-fields-manager"

export default async function CustomFieldsPage() {
  const { role } = await getTenant()
  // Mesma regra da action: definir a estrutura do cadastro é decisão da
  // empresa, não de quem está em campo.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const t = await getTranslations("customFields")
  const [camposCliente, camposOS] = await Promise.all([
    getCustomFields("CLIENT"),
    getCustomFields("SERVICE_ORDER"),
  ])

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <CustomFieldsManager entity="CLIENT" campos={camposCliente} />
      <CustomFieldsManager entity="SERVICE_ORDER" campos={camposOS} />
    </div>
  )
}
