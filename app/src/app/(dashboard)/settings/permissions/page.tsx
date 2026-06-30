import { getPermissions } from "@/actions/permissions"
import { PermissionsForm } from "@/components/settings/permissions-form"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function PermissionsPage() {
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const permissions = await getPermissions()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Controle de Acesso</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina quais abas os técnicos podem acessar no sistema
        </p>
      </div>
      <PermissionsForm permissions={permissions} />
    </div>
  )
}
