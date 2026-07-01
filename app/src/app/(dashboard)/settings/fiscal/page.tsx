import { getFiscalStatus, registerFiscalCompany } from "@/actions/nfse"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { CheckCircle2, Building2, FileText } from "lucide-react"

export default async function FiscalSettingsPage() {
  const { role } = await getTenant()
  if (role !== "OWNER") redirect("/settings")

  const fiscal = await getFiscalStatus()
  const isConfigured = !!fiscal?.nfeioCompanyId

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="size-6" />
          Configuração Fiscal — NFS-e
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure os dados da sua empresa para emitir Notas Fiscais de Serviço Eletrônicas.
        </p>
      </div>

      {isConfigured ? (
        <div className="rounded-lg border border-green-600 bg-green-50 dark:bg-green-950 p-6 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
            <CheckCircle2 className="size-5" />
            Empresa fiscal configurada
          </div>
          <p className="text-sm text-muted-foreground">
            CNPJ: <span className="font-mono font-medium">{fiscal.fiscalCnpj}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Cidade: {fiscal.fiscalCityName} — {fiscal.fiscalStateCode}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            ID nfe.io: <span className="font-mono">{fiscal.nfeioCompanyId}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Building2 className="size-5" />
            Cadastrar empresa para emissão de NFS-e
          </div>
          <p className="text-sm text-muted-foreground">
            Preencha os dados da sua empresa. Esses dados serão usados para emitir NFS-e via nfe.io.
          </p>

          <form action={registerFiscalCompany} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">CNPJ *</label>
                <input
                  name="cnpj"
                  required
                  placeholder="00.000.000/0001-00"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Inscrição Municipal</label>
                <input
                  name="municipalTaxNumber"
                  placeholder="Número IM"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail da empresa *</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="contato@empresa.com"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">CEP *</label>
                <input
                  name="postalCode"
                  required
                  placeholder="00000-000"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Número *</label>
                <input
                  name="number"
                  required
                  placeholder="123"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Logradouro *</label>
                <input
                  name="street"
                  required
                  placeholder="Rua das Flores"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Bairro *</label>
                <input
                  name="district"
                  required
                  placeholder="Centro"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Estado (UF) *</label>
                <input
                  name="state"
                  required
                  maxLength={2}
                  placeholder="SP"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Cidade *</label>
                <input
                  name="cityName"
                  required
                  placeholder="São Paulo"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Código IBGE da cidade *</label>
                <input
                  name="cityCode"
                  required
                  placeholder="3550308"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Busque em{" "}
                  <a
                    href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php"
                    target="_blank"
                    className="underline"
                  >
                    ibge.gov.br
                  </a>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Alíquota ISS (%) *</label>
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
              Cadastrar empresa no nfe.io
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
