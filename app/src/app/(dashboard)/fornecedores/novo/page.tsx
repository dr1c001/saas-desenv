import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { FornecedorForm } from "@/components/fornecedores/fornecedor-form"

export default async function NovoFornecedorPage() {
  const { role } = await getTenant()
  // Menu escondido não é proteção: a URL continua digitável. A Action se
  // defende sozinha também.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/fornecedores")

  const t = await getTranslations("fornecedores")

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("novo")}</h1>
        <p className="text-sm text-muted-foreground">{t("formAjuda")}</p>
      </div>
      <FornecedorForm />
    </div>
  )
}
