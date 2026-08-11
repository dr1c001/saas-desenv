import { notFound } from "next/navigation"
import Link from "next/link"
import { getClient } from "@/actions/clients"
import { deleteClient } from "@/actions/clients"
import { getClientEquipments } from "@/actions/equipment"
import { getCustomFields } from "@/actions/custom-fields"
import { paraExibicao } from "@/lib/custom-fields"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Pencil, Plus } from "lucide-react"
import { DeleteButton } from "@/components/shared/delete-button"
import { EquipmentSection } from "@/components/clients/equipment-section"
import { formatCurrency, formatOsNumber } from "@/lib/utils"
import { getTranslations } from "next-intl/server"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  DEFAULTER: "destructive",
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [client, equipments] = await Promise.all([getClient(id), getClientEquipments(id)])
  if (!client) notFound()
  const t = await getTranslations("clients")
  const tc = await getTranslations("common")
  const tcf = await getTranslations("customFields")

  const personalizados = paraExibicao(await getCustomFields("CLIENT"), client.customValues)

  const addr = client.address
  const addressLine = addr
    ? [addr.street, addr.number, addr.district, addr.city, addr.state]
        .filter(Boolean)
        .join(", ")
    : null

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <Badge variant={STATUS_VARIANT[client.status]} className="mt-1">
            {tc(`clientStatus.${client.status}` as "clientStatus.ACTIVE")}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil className="size-4 mr-2" />
            {tc("edit")}
          </Link>
          <DeleteButton action={deleteClient.bind(null, id)} label={t("detail.deleteButton")} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.contactTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {client.document && <p><span className="text-muted-foreground">{t("detail.docLabel")}</span> {client.document}</p>}
            {client.phone && <p><span className="text-muted-foreground">{t("detail.phoneLabel")}</span> {client.phone}</p>}
            {(client as { whatsapp?: string | null }).whatsapp && (
              <p><span className="text-muted-foreground">{t("detail.whatsappLabel")}</span> {(client as { whatsapp?: string | null }).whatsapp}</p>
            )}
            {client.email && <p><span className="text-muted-foreground">{t("detail.emailLabel")}</span> {client.email}</p>}
            {!client.document && !client.phone && !client.email && (
              <p className="text-muted-foreground">{t("detail.noContact")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.addressTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {addressLine || <p className="text-muted-foreground">{t("detail.notProvided")}</p>}
            {addr?.zipCode && <p className="text-muted-foreground">{t("detail.zipCodeLabel")} {addr.zipCode}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Campos criados pela própria empresa. paraExibicao() percorre as
          DEFINIÇÕES, então campo apagado depois de preenchido some daqui
          sozinho, sem deixar dado órfão na ficha. */}
      {personalizados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tcf("formSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {personalizados.map((campo) => (
              <div key={campo.label}>
                <p className="text-muted-foreground text-xs">{campo.label}</p>
                <p>
                  {campo.type === "CHECKBOX"
                    ? tcf(campo.valor === "true" ? "yes" : "no")
                    : campo.valor}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {client.serviceOrders.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.totalOrders")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{client.serviceOrders.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.totalInvoiced")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  client.serviceOrders
                    .filter((o) => o.status === "INVOICED" || o.status === "DONE")
                    .reduce((s, o) => s + Number(o.totalAmount), 0)
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.activeOrders")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {client.serviceOrders.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS").length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <EquipmentSection clientId={id} equipments={equipments} />

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("detail.ordersTitle")}</h2>
          <Link
            href={`/service-orders/new?clientId=${id}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Plus className="size-4 mr-2" />
            {t("detail.newOrderButton")}
          </Link>
        </div>

        {client.serviceOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.noOrders")}</p>
        ) : (
          <div className="space-y-2">
            {client.serviceOrders.map((os) => (
              <Link
                key={os.id}
                href={`/service-orders/${os.id}`}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{formatOsNumber(os.number, os.createdAt)} — {os.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(os.createdAt).toLocaleDateString("pt-BR")} · {formatCurrency(Number(os.totalAmount))}
                  </p>
                </div>
                <Badge variant="outline">{tc(`serviceOrderStatus.${os.status}` as "serviceOrderStatus.OPEN")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
