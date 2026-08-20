import { getAcoes, getPermissions } from "@/actions/permissions"
import { PermissionsForm } from "@/components/settings/permissions-form"
import { AcoesForm } from "@/components/settings/acoes-form"
import { getTenant } from "@/lib/auth"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"

export default async function PermissionsPage() {
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const t = await getTranslations("settingsAdvanced.permissions")
  const [permissions, acoes] = await Promise.all([getPermissions(), getAcoes()])

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("abasTitle")}</h2>
        <PermissionsForm permissions={permissions} />
      </div>

      {/* Segunda seção, e não uma lista só: quais abas a pessoa ENXERGA e o que
          ela FAZ dentro delas são perguntas diferentes, e misturar as duas em
          uma lista de vinte e sete caixas esconderia justamente a que mais
          importa (editar o valor da OS). */}
      <AcoesForm acoes={acoes} />
    </div>
  )
}
