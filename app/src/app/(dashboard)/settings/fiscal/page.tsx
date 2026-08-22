import { getFiscalStatus, registerFiscalCompany } from "@/actions/nfse"
import { estadoDoCertificado } from "@/actions/certificado"
import { CertificadoForm } from "@/components/settings/certificado-form"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { CheckCircle2, Building2, FileText } from "lucide-react"

export default async function FiscalSettingsPage() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER") redirect("/settings")
  // "Emissão de NFS-e" começa no plano Pro. A aba já some do menu
  // (getAllowedTabs), mas a URL continua digitável — e as duas Server Actions
  // de nfse.ts também checam por conta própria.
  if (!(await temRecurso(tenantId, "nfse"))) redirect("/billing")

  const t = await getTranslations("settingsAdvanced.fiscal")
  const fiscal = await getFiscalStatus()
  const isConfigured = !!fiscal?.nfeioCompanyId
  const tCert = await getTranslations("certificado")
  const cert = await estadoDoCertificado()


  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="size-6" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      {isConfigured ? (
        <div className="rounded-lg border border-green-600 bg-green-50 dark:bg-green-950 p-6 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
            <CheckCircle2 className="size-5" />
            {t("configured.title")}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("configured.cnpjLabel")} <span className="font-mono font-medium">{fiscal.fiscalCnpj}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("configured.city", {
              city: fiscal.fiscalCityName ?? "",
              state: fiscal.fiscalStateCode ?? "",
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {t("configured.nfeioIdLabel")} <span className="font-mono">{fiscal.nfeioCompanyId}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Building2 className="size-5" />
            {t("form.title")}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("form.description")}
          </p>

          <form action={registerFiscalCompany} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">{t("form.cnpjLabel")}</label>
                <input
                  name="cnpj"
                  required
                  placeholder={t("form.cnpjPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.municipalTaxNumberLabel")}</label>
                <input
                  name="municipalTaxNumber"
                  placeholder={t("form.municipalTaxNumberPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.emailLabel")}</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder={t("form.emailPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.postalCodeLabel")}</label>
                <input
                  name="postalCode"
                  required
                  placeholder={t("form.postalCodePlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.numberLabel")}</label>
                <input
                  name="number"
                  required
                  placeholder={t("form.numberPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">{t("form.streetLabel")}</label>
                <input
                  name="street"
                  required
                  placeholder={t("form.streetPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.districtLabel")}</label>
                <input
                  name="district"
                  required
                  placeholder={t("form.districtPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.stateLabel")}</label>
                <input
                  name="state"
                  required
                  maxLength={2}
                  placeholder={t("form.statePlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.cityLabel")}</label>
                <input
                  name="cityName"
                  required
                  placeholder={t("form.cityPlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.cityCodeLabel")}</label>
                <input
                  name="cityCode"
                  required
                  placeholder={t("form.cityCodePlaceholder")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t.rich("form.cityCodeHelp", {
                    link: (chunks) => (
                      <a
                        href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php"
                        target="_blank"
                        className="underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t("form.issRateLabel")}</label>
                <input
                  name="issRate"
                  type="number"
                  step="0.01"
                  defaultValue="5"
                  required
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button type="submit" className={buttonVariants({ className: "w-full" })}>
              {t("form.submit")}
            </button>
          </form>
        </div>
      )}

      {/* O certificado só faz sentido depois de a empresa existir no emissor —
          é nela que ele é instalado. Mostrar antes convidaria a enviar um
          arquivo que não teria onde ser aplicado. */}
      {isConfigured && (
        <section className="space-y-4 border-t pt-8">
          <div>
            <h2 className="text-lg font-semibold">{tCert("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tCert("subtitle")}</p>
          </div>
          <CertificadoForm
            temCertificado={cert.temCertificado}
            nomeArquivo={cert.nomeArquivo}
            validoAte={cert.validoAte}
            diasParaVencer={cert.diasParaVencer}
            cofrePronto={cert.cofrePronto}
          />
        </section>
      )}
    </div>
  )
}
