import { getTranslations } from "next-intl/server"
import { getSettings } from "@/actions/settings"
import { TenantForm } from "@/components/settings/tenant-form"
import { LogoSetting } from "@/components/settings/logo-setting"
import { ProfileForm } from "@/components/settings/profile-form"
import { AssinaturaForm } from "@/components/settings/assinatura-form"
import { minhaAssinatura } from "@/actions/assinatura"
import { AvisosForm } from "@/components/settings/avisos-form"
import { minhasPreferencias } from "@/actions/notificacoes"
import { WhatsAppForm } from "@/components/settings/whatsapp-form"
import { AvisoClienteForm } from "@/components/settings/aviso-cliente-form"
import { getAvisoCliente } from "@/actions/aviso-cliente"
import { DocumentosForm } from "@/components/settings/documentos-form"
import { getDocumentos } from "@/actions/documentos"
import { PixForm } from "@/components/settings/pix-form"
import { getPix } from "@/actions/pix"
import { ExportDataButton } from "@/components/settings/export-data-button"
import { LanguageSetting } from "@/components/settings/language-setting"
import { Separator } from "@/components/ui/separator"

export default async function SettingsPage() {
  const { tenant, user, isAdmin, isOwner } = await getSettings()
  const aviso = await getAvisoCliente()
  const documentos = await getDocumentos()
  const pix = await getPix()
  const t = await getTranslations("settingsCore")
  const tAss = await getTranslations("assinatura")
  const assinatura = await minhaAssinatura()
  const tAvisos = await getTranslations("avisos")
  const avisos = await minhasPreferencias()

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
            <LogoSetting logoAtual={tenant?.logoUrl ?? null} />
          </section>

          <Separator />

          {/* Idioma é decisão de empresa (vale pra equipe toda e pro que sai
              pros clientes), então vive aqui junto das outras — e não mais
              como um botão de um clique na sidebar. (Ver seção 7.2.1.) */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("language.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("language.description")}</p>
            </div>
            <LanguageSetting />
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

      <Separator />

      {/* A assinatura é de CADA PESSOA, não da empresa — por isso fica no
          Perfil e não em Dados da empresa, e aparece para todo mundo, técnico
          incluído. É justamente a do técnico que sai na OS que ele conclui. */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{tAss("title")}</h2>
          <p className="text-sm text-muted-foreground">{tAss("description")}</p>
        </div>
        <AssinaturaForm atual={assinatura} />
      </section>

      <Separator />

      {/* Preferência de CADA PESSOA, como a assinatura — por isso fica no
          Perfil e aparece para todo mundo, técnico incluído. */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{tAvisos("title")}</h2>
          <p className="text-sm text-muted-foreground">{tAvisos("description")}</p>
        </div>
        <AvisosForm atual={avisos} />
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

      {/* Aviso automático ao cliente final. Fica logo depois do WhatsApp
          porque é o canal que ele usa, e a tela explica quando um depende
          do outro. */}
      {isAdmin && (
        <DocumentosForm
          orderTerms={documentos.orderTerms}
          quoteTerms={documentos.quoteTerms}
          warrantyDays={documentos.warrantyDays}
        />
      )}

      {isAdmin && (
        <AvisoClienteForm atual={aviso.config} whatsappConfigurado={aviso.whatsappConfigurado} />
      )}

      {/* Cobrança por PIX. Fica perto dos documentos porque é onde o código
          sai impresso — OS e orçamento. */}
      {isAdmin && <PixForm atual={pix} />}
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
