import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getServiceOrder, updateOrderStatus, deleteServiceOrder } from "@/actions/service-orders"
import { buttonVariants } from "@/components/ui/button"
import { FileDown, Pencil, ExternalLink } from "lucide-react"
import { NfseButton } from "@/components/service-orders/nfse-button"
import { Checklist } from "@/components/service-orders/checklist"
import { SignaturePad } from "@/components/service-orders/signature-pad"
import { OsFotos } from "@/components/service-orders/os-fotos"
import { getFotosDaOs } from "@/actions/attachments"
import { getTenant } from "@/lib/auth"
import { WhatsAppButton } from "@/components/service-orders/whatsapp-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { DeleteButton } from "@/components/shared/delete-button"
import { StatusButton } from "@/components/service-orders/status-button"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"

export default async function ServiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const os = await getServiceOrder(id)
  if (!os) notFound()

  const [fotos, { role }] = await Promise.all([getFotosDaOs(id), getTenant()])

  const t = await getTranslations("serviceOrdersPages")
  const tCommon = await getTranslations("common")

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; next?: string; nextLabel?: string }> = {
    OPEN: { label: tCommon("serviceOrderStatus.OPEN"), variant: "secondary", next: "IN_PROGRESS", nextLabel: t("detail.actions.startService") },
    IN_PROGRESS: { label: tCommon("serviceOrderStatus.IN_PROGRESS"), variant: "default", next: "DONE", nextLabel: t("detail.actions.markDone") },
    DONE: { label: tCommon("serviceOrderStatus.DONE"), variant: "outline", next: "INVOICED", nextLabel: t("detail.actions.markInvoiced") },
    INVOICED: { label: tCommon("serviceOrderStatus.INVOICED"), variant: "outline" },
    CANCELLED: { label: tCommon("serviceOrderStatus.CANCELLED"), variant: "destructive" },
  }

  const config = statusConfig[os.status]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-mono text-muted-foreground">{formatOsNumber(os.number, os.createdAt)}</p>
          <h1 className="text-2xl font-bold">{os.title}</h1>
          <Badge variant={config.variant} className="mt-1">{config.label}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.next && (
            <StatusButton
              action={updateOrderStatus.bind(null, id, config.next)}
              label={config.nextLabel!}
            />
          )}
          {/* updateServiceOrder recusa OS faturada (NFS-e emitida, assinatura
              coletada). O botão aparecia mesmo assim, e só dava erro depois de
              preencher o formulário inteiro. */}
          {os.status !== "INVOICED" && (
            <Link
              href={`/service-orders/${id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="size-4 mr-2" />
              {tCommon("edit")}
            </Link>
          )}
          <Link
            href={`/api/pdf/service-order/${id}`}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            <FileDown className="size-4 mr-2" />
            PDF
          </Link>
          <WhatsAppButton type="os" id={id} />
          {os.clientToken && (
            <Link
              href={`/p/${os.clientToken}`}
              target="_blank"
              className={buttonVariants({ variant: "outline" }) + " gap-2"}
            >
              <ExternalLink className="size-4" />
              {t("detail.clientPortal")}
            </Link>
          )}
          <DeleteButton action={deleteServiceOrder.bind(null, id)} label={t("detail.deleteLabel")} />
          {(os.status === "DONE" || os.status === "INVOICED") && (
            <NfseButton
              orderId={id}
              nfseId={os.nfseId}
              nfseStatus={os.nfseStatus}
              nfseUrl={os.nfseUrl}
              nfseNumber={os.nfseNumber}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t("detail.clientLabel")}</span>
              <Link href={`/clients/${os.clientId}`} className="hover:underline font-medium">
                {os.client.name}
              </Link>
            </p>
            {os.technician && (
              <p><span className="text-muted-foreground">{t("detail.responsibleLabel")}</span>{os.technician.name}</p>
            )}
            <p><span className="text-muted-foreground">{t("detail.createdLabel")}</span>{formatDate(os.createdAt)}</p>
            {os.scheduledAt && (
              <p><span className="text-muted-foreground">{t("detail.scheduledLabel")}</span>{formatDate(os.scheduledAt)}</p>
            )}
            {os.concludedAt && (
              <p><span className="text-muted-foreground">{t("detail.concludedLabel")}</span>{formatDate(os.concludedAt)}</p>
            )}
          </CardContent>
        </Card>

        {os.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.problemDescriptionTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{os.description}</p>
            </CardContent>
          </Card>
        )}

        {os.conclusionNote && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("detail.servicesPerformedTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{os.conclusionNote}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {os.checklist.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detail.checklistTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist
              orderId={id}
              items={os.checklist}
              readonly={os.status === "INVOICED" || os.status === "CANCELLED"}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Fotos antes da assinatura de propósito: o cliente final assina
          depois de ver o registro do que foi feito, não antes. */}
      <OsFotos
        orderId={id}
        fotos={fotos}
        podeApagar={role === "OWNER" || role === "ADMIN"}
        bloqueada={os.status === "INVOICED"}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.signatureTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SignaturePad orderId={id} existingSignatureUrl={os.clientSignatureUrl} />
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.itemsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {os.items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t("detail.noItems")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("detail.itemColumns.description")}</TableHead>
                  <TableHead className="text-right">{t("detail.itemColumns.quantity")}</TableHead>
                  <TableHead className="text-right">{t("detail.itemColumns.unitPrice")}</TableHead>
                  <TableHead className="text-right">{t("detail.itemColumns.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {os.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(item.unitPrice))}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(item.total))}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">{t("detail.itemColumns.total")}</TableCell>
                  <TableCell className="text-right font-bold text-base">
                    {formatCurrency(Number(os.totalAmount))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
