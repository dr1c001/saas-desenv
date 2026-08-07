import { notFound } from "next/navigation"
import { getClient } from "@/actions/clients"
import { ClientForm } from "@/components/clients/client-form"
import { getTranslations } from "next-intl/server"

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getClient(id)
  if (!client) notFound()
  const t = await getTranslations("clients")

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("edit.title")}</h1>
      <ClientForm client={client} />
    </div>
  )
}
