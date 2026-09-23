import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { getTenant } from "@/lib/auth"
import { ImportForm } from "@/components/clients/import-form"

export default async function ImportClientsPage() {
  const { role } = await getTenant()
  // Mesma regra da action: importar em massa é OWNER/ADMIN. A checagem no
  // servidor é a que vale — esta aqui só evita mostrar a tela pra quem vai
  // levar "sem permissão" ao enviar.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/clients")

  const t = await getTranslations("clients.import")

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <Link
          href="/clients"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}
        >
          <ArrowLeft className="size-4 mr-1.5" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <ImportForm />
    </div>
  )
}
