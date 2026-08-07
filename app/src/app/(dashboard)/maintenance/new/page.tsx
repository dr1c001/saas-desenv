import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { buttonVariants } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { MaintenanceForm } from "@/components/maintenance/maintenance-form"
import { getProviders } from "@/actions/providers"

export default async function NewMaintenancePage() {
  const providers = await getProviders()
  const t = await getTranslations("maintenance")

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/maintenance" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      </div>
      <MaintenanceForm providers={providers} />
    </div>
  )
}
