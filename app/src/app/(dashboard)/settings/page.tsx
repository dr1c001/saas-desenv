import { getTranslations } from "next-intl/server"
import { getSettings } from "@/actions/settings"
import { TenantForm } from "@/components/settings/tenant-form"
import { ProfileForm } from "@/components/settings/profile-form"
import { WhatsAppForm } from "@/components/settings/whatsapp-form"
import { ExportDataButton } from "@/components/settings/export-data-button"
import { Separator } from "@/components/ui/separator"

export default async function SettingsPage() {
  const { tenant, user, isAdmin, isOwner } = await getSettings()
  const t = await getTranslations("settingsCore")

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {isAdmin && (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("company.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("company.description")}</p>
            </div>
            <TenantForm tenant={tenant} />
          </section>

          <Separator />
        </>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("profile.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("profile.description")}</p>
        </div>
        <ProfileForm user={user} />
      </section>

      {isAdmin && (
        <>
          <Separator />

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("whatsapp.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("whatsapp.description")}</p>
            </div>
            <WhatsAppForm zapiInstance={tenant?.zapiInstance ?? null} zapiToken={tenant?.zapiToken ?? null} />
          </section>
        </>
      )}

      {isOwner && (
        <>
          <Separator />

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("export.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t.rich("export.description", { code: (chunks) => <code>{chunks}</code> })}
              </p>
            </div>
            <ExportDataButton />
          </section>
        </>
      )}
    </div>
  )
}
