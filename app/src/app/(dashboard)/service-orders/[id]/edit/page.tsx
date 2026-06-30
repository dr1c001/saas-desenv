import { notFound } from "next/navigation"
import { getServiceOrder } from "@/actions/service-orders"
import { getClients } from "@/actions/clients"
import { ServiceOrderEditForm } from "@/components/service-orders/service-order-edit-form"
import { formatOsNumber } from "@/lib/utils"

export default async function EditServiceOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, clients] = await Promise.all([getServiceOrder(id), getClients()])
  if (!order) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-mono text-muted-foreground">{formatOsNumber(order.number, order.createdAt)}</p>
        <h1 className="text-2xl font-bold">Editar Ordem de Serviço</h1>
      </div>
      <ServiceOrderEditForm order={order} clients={clients} />
    </div>
  )
}
