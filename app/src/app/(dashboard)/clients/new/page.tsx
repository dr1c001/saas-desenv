import { ClientForm } from "@/components/clients/client-form"
import { getCustomFields } from "@/actions/custom-fields"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { getAcoesPermitidas, getTenant } from "@/lib/auth"
import { podeFazer } from "@/lib/acoes"

// A tela também se defende: sem isso o técnico digita a URL, preenche o
// formulário inteiro e só leva a recusa no fim. A Action continua checando —
// esconder tela nunca foi proteção.
async function exigir(acao: Parameters<typeof podeFazer>[2], voltarPara: string) {
  const { tenantId, role } = await getTenant()
  if (!podeFazer(role, await getAcoesPermitidas(tenantId, role), acao)) redirect(voltarPara)
}

export default async function NewClientPage() {
  await exigir("cliente.criar", "/clients")
  const t = await getTranslations("clients")
  const camposPersonalizados = await getCustomFields("CLIENT")

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      <ClientForm camposPersonalizados={camposPersonalizados} />
    </div>
  )
}
