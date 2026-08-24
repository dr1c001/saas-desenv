import { notFound } from "next/navigation"
import { getClient } from "@/actions/clients"
import { ClientForm } from "@/components/clients/client-form"
import { getCustomFields } from "@/actions/custom-fields"
import { getTranslations } from "next-intl/server"
import { listarPossiveisContratantes } from "@/actions/clients"

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getClient(id)
  if (!client) notFound()
  const t = await getTranslations("clients")
  const camposPersonalizados = await getCustomFields("CLIENT")

  // Quem pode ser contratante: quem NAO e subcliente de ninguem. A regra de
  // um nivel (lib/subcliente.ts) recusaria os outros, e oferecer na tela o
  // que a gravacao vai recusar e pior que nao oferecer.
  const contratantes = await listarPossiveisContratantes(client.id)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("edit.title")}</h1>
      <ClientForm client={client} camposPersonalizados={camposPersonalizados} contratantes={contratantes} />
    </div>
  )
}
