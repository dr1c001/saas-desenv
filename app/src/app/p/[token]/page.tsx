import { notFound } from "next/navigation"
import { temFuncao } from "@/lib/plan"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, Wrench, FileCheck2, XCircle, Star, QrCode } from "lucide-react"
import { SignaturePadPublic } from "@/components/service-orders/signature-pad-public"
import { NpsWidget } from "@/components/portal/nps-widget"
import { PixPagamento } from "@/components/portal/pix-pagamento"
import { formatCurrency } from "@/lib/utils"
import { getTranslator } from "@/lib/i18n"
import { cobrancaPix } from "@/lib/pix"
import { gerarQr } from "@/lib/qr"

// Só ícone e cor — os rótulos dos 5 status vêm de common.serviceOrderStatus,
// compartilhados com o resto do app.
const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  OPEN:        { icon: Clock,        color: "text-blue-500" },
  IN_PROGRESS: { icon: Wrench,       color: "text-yellow-500" },
  DONE:        { icon: CheckCircle2, color: "text-green-500" },
  INVOICED:    { icon: FileCheck2,   color: "text-purple-500" },
  CANCELLED:   { icon: XCircle,      color: "text-red-500" },
}

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ prefillScore?: string }>
}) {
  const { token } = await params
  const { prefillScore: prefillScoreRaw } = await searchParams
  const prefillScoreNum = prefillScoreRaw === undefined ? NaN : Number(prefillScoreRaw)
  const prefillScore = Number.isInteger(prefillScoreNum) && prefillScoreNum >= 0 && prefillScoreNum <= 10 ? prefillScoreNum : null

  const order = await prisma.serviceOrder.findUnique({
    where: { clientToken: token },
    include: {
      items: true,
      tenant: {
        select: {
          id: true,
          name: true, phone: true, logoUrl: true, locale: true,
          pixKey: true, pixKeyType: true, pixReceiver: true, pixCity: true,
        },
      },
      client: { select: { name: true } },
      technician: { select: { name: true } },
    },
  })

  if (!order) notFound()
  // Desligado para esta empresa: o link simplesmente não existe, em vez de
  // abrir uma tela avisando que existe mas está fechada — o cliente FINAL não
  // tem o que fazer com essa informação, e ela conta o que a empresa contratou.
  if (!(await temFuncao(order.tenant.id, "portalCliente"))) notFound()

  // Portal público: não existe sessão pro src/i18n/request.ts resolver o
  // tenant, então o idioma vem explícito de quem é dono da OS e desce por
  // prop pros componentes client. (Ver lib/i18n.ts.)
  const locale = order.tenant.locale
  const t = getTranslator(locale, "portal")
  const tc = getTranslator(locale, "common")
  const dateLocale = locale === "en" ? "en-US" : "pt-BR"

  const cfg = statusConfig[order.status] ?? statusConfig.OPEN
  const Icon = cfg.icon
  // status vem do banco como string — .has() preserva o fallback pro OPEN que
  // o mapa local tinha antes (`statusConfig[order.status] ?? statusConfig.OPEN`).
  const statusKey = `serviceOrderStatus.${order.status}` as "serviceOrderStatus.OPEN"
  const statusLabel = tc.has(statusKey) ? tc(statusKey) : tc("serviceOrderStatus.OPEN")
  const year = new Date(order.createdAt).getFullYear()
  const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
  const isDone = order.status === "DONE" || order.status === "INVOICED"

  // Cobrança por PIX: só depois de concluída, e só se a empresa configurou a
  // chave. Antes da conclusão o valor ainda pode mudar, e um QR com valor
  // velho é pior que nenhum — o cliente paga a mais ou a menos e sobra
  // acerto manual pros dois lados.
  //
  // Cancelada nunca cobra. INVOICED continua cobrando: nota emitida não quer
  // dizer paga.
  const totalPix = Number(order.totalAmount)
  const cobranca = isDone && totalPix > 0 ? cobrancaPix(order.tenant, totalPix, osNum) : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t("serviceOrder.headerSubtitle")}</p>
            <p className="font-bold text-primary">{order.tenant.name}</p>
          </div>
          {order.tenant.phone && (
            <a href={`tel:${order.tenant.phone}`} className="text-sm text-muted-foreground hover:text-foreground">
              📞 {order.tenant.phone}
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-4">
        {/* Status card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-2">
              <Icon className={`size-12 ${cfg.color}`} />
              <p className="text-lg font-bold">{statusLabel}</p>
              <p className="text-sm text-muted-foreground">{osNum} — {order.title}</p>
              {order.technician && (
                <p className="text-sm text-muted-foreground">
                  {t("serviceOrder.responsibleLabel", { name: order.technician.name })}
                </p>
              )}
              {order.scheduledAt && (
                <Badge variant="outline">
                  {t("serviceOrder.scheduledLabel", {
                    date: new Date(order.scheduledAt).toLocaleString(dateLocale, {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    }),
                  })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        {order.description && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("serviceOrder.descriptionTitle")}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{order.description}</p></CardContent>
          </Card>
        )}

        {/* Conclusion note */}
        {order.conclusionNote && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("serviceOrder.servicesPerformedTitle")}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{order.conclusionNote}</p></CardContent>
          </Card>
        )}

        {/* Items */}
        {order.items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("serviceOrder.items.title")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">{t("serviceOrder.items.description")}</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">{t("serviceOrder.items.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{item.description} <span className="text-muted-foreground">×{Number(item.quantity)}</span></td>
                      <td className="px-4 py-2 text-right">{formatCurrency(Number(item.total))}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-muted/50">
                    <td className="px-4 py-2">{t("serviceOrder.items.total")}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(Number(order.totalAmount))}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* PIX — logo depois do total, que é quando a pergunta "como pago?"
            aparece. */}
        {cobranca && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <QrCode className="size-4" />
                {t("pix.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PixPagamento
                codigo={cobranca.codigo}
                qr={gerarQr(cobranca.codigo)}
                valor={totalPix}
                recebedor={cobranca.recebedor}
                locale={locale}
              />
            </CardContent>
          </Card>
        )}

        {/* Signature */}
        {isDone && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("serviceOrder.signatureTitle")}</CardTitle></CardHeader>
            <CardContent>
              <SignaturePadPublic orderId={order.id} clientToken={token} existingSignatureUrl={order.clientSignatureUrl} locale={locale} />
            </CardContent>
          </Card>
        )}

        {/* NPS */}
        {isDone && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Star className="size-4" />
                {t("serviceOrder.npsTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NpsWidget
                orderId={order.id}
                clientToken={token}
                existingScore={order.npsScore}
                existingFeedback={order.npsFeedback}
                prefillScore={prefillScore}
                locale={locale}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
