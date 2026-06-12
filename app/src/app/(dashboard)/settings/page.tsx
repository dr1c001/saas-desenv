import { getSettings } from "@/actions/settings"
import { TenantForm } from "@/components/settings/tenant-form"
import { ProfileForm } from "@/components/settings/profile-form"
import { Separator } from "@/components/ui/separator"

export default async function SettingsPage() {
  const { tenant, user } = await getSettings()

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Empresa</h2>
          <p className="text-sm text-muted-foreground">Dados que aparecem nas OS e PDFs gerados.</p>
        </div>
        <TenantForm tenant={tenant} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Meu perfil</h2>
          <p className="text-sm text-muted-foreground">Seu nome e e-mail de acesso.</p>
        </div>
        <ProfileForm user={user} />
      </section>
    </div>
  )
}
