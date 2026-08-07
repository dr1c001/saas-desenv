import { ClientForm } from "@/components/clients/client-form"
import { getTranslations } from "next-intl/server"

export default async function NewClientPage() {
  const t = await getTranslations("clients")

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      <ClientForm />
    </div>
  )
}
