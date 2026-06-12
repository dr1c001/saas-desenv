import { notFound } from "next/navigation"
import { getClient } from "@/actions/clients"
import { ClientForm } from "@/components/clients/client-form"

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getClient(id)
  if (!client) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Editar cliente</h1>
      <ClientForm client={client} />
    </div>
  )
}
