import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getAcoesPermitidas, getTenant } from "@/lib/auth"
import { podeFazer } from "@/lib/acoes"
import { getServiceOrder } from "@/actions/service-orders"
import { getClients } from "@/actions/clients"
import { ServiceOrderEditForm } from "@/components/service-orders/service-order-edit-form"
import { formatOsNumber } from "@/lib/utils"

// A tela também se defende: sem isso o técnico digita a URL, preenche o
// formulário inteiro e só leva a recusa no fim. A Action continua checando —
// esconder tela nunca foi proteção.
async function exigir(acao: Parameters<typeof podeFazer>[2], voltarPara: string) {
  const { tenantId, role } = await getTenant()
  if (!podeFazer(role, await getAcoesPermitidas(tenantId, role), acao)) redirect(voltarPara)
}

export default async function EditServiceOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await exigir("os.editar", `/service-orders/${id}`)
  const [order, clients] = await Promise.all([getServiceOrder(id), getClients()])
  if (!order) notFound()

  const t = await getTranslations("serviceOrdersPages")

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-mono text-muted-foreground">{formatOsNumber(order.number, order.createdAt)}</p>
        <h1 className="text-2xl font-bold">{t("edit.title")}</h1>
      </div>
      <ServiceOrderEditForm order={order} clients={clients} />
    </div>
  )
}
