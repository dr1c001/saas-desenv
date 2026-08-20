import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { listarChaves } from "@/actions/api-chaves"
import { ApiKeysForm } from "@/components/settings/api-keys-form"
import { Card, CardContent } from "@/components/ui/card"

export default async function ApiKeysPage() {
  const { role, tenantId } = await getTenant()
  // Chave de API dá leitura e escrita na base inteira da empresa. Não é tela
  // de técnico.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")
  if (!(await temRecurso(tenantId, "api"))) redirect("/billing")

  const t = await getTranslations("apiKeys")
  const chaves = await listarChaves()
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ApiKeysForm chaves={chaves} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("docs.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("docs.intro")}</p>

        <Card>
          <CardContent className="space-y-4 pt-4 text-sm">
            <div>
              <p className="font-medium">{t("docs.baseUrl")}</p>
              <pre className="mt-1 overflow-x-auto rounded border bg-muted/50 p-2 font-mono text-xs">
                {base}/api/v1
              </pre>
            </div>

            <div>
              <p className="font-medium">{t("docs.autenticacao")}</p>
              <pre className="mt-1 overflow-x-auto rounded border bg-muted/50 p-2 font-mono text-xs">
                {`curl ${base}/api/v1/service-orders \\\n  -H "Authorization: Bearer SUA_CHAVE"`}
              </pre>
            </div>

            <div>
              <p className="font-medium">{t("docs.endpoints")}</p>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                <li>GET&nbsp;&nbsp;/api/v1/clients</li>
                <li>POST&nbsp;/api/v1/clients</li>
                <li>GET&nbsp;&nbsp;/api/v1/service-orders</li>
                <li>POST&nbsp;/api/v1/service-orders</li>
                <li>GET&nbsp;&nbsp;/api/v1/service-orders/{"{id}"}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">{t("docs.exemplo")}</p>
              <pre className="mt-1 overflow-x-auto rounded border bg-muted/50 p-2 font-mono text-xs">
                {`curl -X POST ${base}/api/v1/service-orders \\
  -H "Authorization: Bearer SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": "...",
    "title": "Troca de bomba",
    "scheduled_at": "2026-09-01T14:00:00Z",
    "items": [
      { "description": "Mao de obra", "quantity": 1, "unit_price": 250 }
    ]
  }'`}
              </pre>
            </div>

            <div>
              <p className="font-medium">{t("docs.paginacao")}</p>
              <p className="mt-1 text-muted-foreground">{t("docs.paginacaoTexto")}</p>
            </div>

            <div>
              <p className="font-medium">{t("docs.limite")}</p>
              <p className="mt-1 text-muted-foreground">{t("docs.limiteTexto")}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
