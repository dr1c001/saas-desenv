import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { buttonVariants } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { MaintenanceForm } from "@/components/maintenance/maintenance-form"
import { getProviders } from "@/actions/providers"
import { getBens } from "@/actions/patrimonio"

export default async function NewMaintenancePage() {
  // Os bens ATIVOS, para a OM poder dar histórico à van ou à máquina.
  const [providers, bens] = await Promise.all([getProviders(), getBens()])
  const t = await getTranslations("maintenance")

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/maintenance" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      </div>
      <MaintenanceForm
        providers={providers}
        bens={bens
          .filter((b) => b.status === "ATIVO")
          .map((b) => ({ id: b.id, name: b.name, brand: b.brand }))}
      />
    </div>
  )
}
