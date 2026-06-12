import { getClients } from "@/actions/clients"
import { ServiceOrderForm } from "@/components/service-orders/service-order-form"

export default async function NewServiceOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  const clients = await getClients()

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Nova Ordem de Serviço</h1>
      <ServiceOrderForm clients={clients} defaultClientId={clientId} />
    </div>
  )
}
