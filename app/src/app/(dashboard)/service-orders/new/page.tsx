import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { getAcoesPermitidas, getTenant } from "@/lib/auth"
import { podeFazer } from "@/lib/acoes"
import { getClients } from "@/actions/clients"
import { getTeamMembers } from "@/actions/team"
import { ServiceOrderForm } from "@/components/service-orders/service-order-form"

// A tela também se defende: sem isso o técnico digita a URL, preenche o
// formulário inteiro e só leva a recusa no fim. A Action continua checando —
// esconder tela nunca foi proteção.
async function exigir(acao: Parameters<typeof podeFazer>[2], voltarPara: string) {
  const { tenantId, role } = await getTenant()
  if (!podeFazer(role, await getAcoesPermitidas(tenantId, role), acao)) redirect(voltarPara)
}

export default async function NewServiceOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  await exigir("os.criar", "/service-orders")
  const t = await getTranslations("serviceOrdersPages")
  const [clients, teamMembers] = await Promise.all([getClients(), getTeamMembers()])

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      <ServiceOrderForm
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          parentName: c.parent?.name ?? null,
        }))}
        teamMembers={teamMembers}
        defaultClientId={clientId}
      />
    </div>
  )
}
