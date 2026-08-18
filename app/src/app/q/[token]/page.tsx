import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { QuoteApprovalButtons } from "@/components/portal/quote-approval-buttons"
import { PixPagamento } from "@/components/portal/pix-pagamento"
import { getTranslator } from "@/lib/i18n"
import { cobrancaPix } from "@/lib/pix"
import { gerarQr } from "@/lib/qr"
import { QrCode } from "lucide-react"

// Só a cor do badge — os rótulos dos 4 status vêm de common.quoteStatus,
// compartilhados com o resto do app.
const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT:    "secondary",
  SENT:     "default",
  APPROVED: "default",
  REJECTED: "destructive",
}

export default async function QuotePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const quote = await prisma.quote.findUnique({
    where: { clientToken: token },
    include: {
      tenant: {
        select: {
          name: true, phone: true, locale: true,
          pixKey: true, pixKeyType: true, pixReceiver: true, pixCity: true,
        },
      },
    },
  })

  if (!quote) notFound()

  // Portal público: não existe sessão pro src/i18n/request.ts resolver o
  // tenant, então o idioma vem explícito de quem é dono do orçamento e desce
  // por prop pros componentes client. (Ver lib/i18n.ts.)
  const locale = quote.tenant.locale
  const t = getTranslator(locale, "portal")
  const tc = getTranslator(locale, "common")
  const dateLocale = locale === "en" ? "en-US" : "pt-BR"

  const badgeColor = statusColors[quote.status] ?? statusColors.SENT
  // status vem do banco como string — .has() preserva o fallback pro SENT que
  // o mapa local tinha antes (`statusLabels[quote.status] ?? statusLabels.SENT`).
  const statusKey = `quoteStatus.${quote.status}` as "quoteStatus.DRAFT"
  const statusLabel = tc.has(statusKey) ? tc(statusKey) : tc("quoteStatus.SENT")
  const year = new Date(quote.createdAt).getFullYear()
  const quoteNum = `ORC${year}${String(quote.number).padStart(4, "0")}`
  const isPending = quote.status === "SENT" || quote.status === "DRAFT"

  // PIX no orçamento só depois de APROVADO. Antes disso o cliente ainda está
  // decidindo, e um QR de pagamento na tela de decisão parece cobrança
  // antecipada — o que espanta mais gente do que converte.
  const totalPix = Number(quote.amount)
  const cobranca =
    quote.status === "APPROVED" && totalPix > 0
      ? cobrancaPix(quote.tenant, totalPix, quoteNum)
      : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t("quote.headerSubtitle")}</p>
            <p className="font-bold text-primary">{quote.tenant.name}</p>
          </div>
          {quote.tenant.phone && (
            <a href={`tel:${quote.tenant.phone}`} className="text-sm text-muted-foreground hover:text-foreground">
              📞 {quote.tenant.phone}
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold text-lg">{quoteNum}</p>
              <Badge variant={badgeColor}>{statusLabel}</Badge>
            </div>
            <p className="text-muted-foreground">{t("quote.forLabel", { name: quote.clientName })}</p>
            {quote.validUntil && (
              <p className="text-sm text-muted-foreground">
                {t("quote.validUntilLabel", { date: new Date(quote.validUntil).toLocaleDateString(dateLocale) })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("quote.descriptionTitle")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{quote.description}</p></CardContent>
        </Card>

        {quote.materials && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t("quote.materialsTitle")}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{quote.materials}</p></CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{t("quote.totalLabel")}</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(Number(quote.amount))}</p>
            </div>
            {quote.notes && <p className="text-xs text-muted-foreground mt-2">{quote.notes}</p>}
          </CardContent>
        </Card>

        {isPending && (
          <QuoteApprovalButtons quoteId={quote.id} clientToken={token} locale={locale} />
        )}

        {quote.status === "APPROVED" && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center text-green-700 dark:text-green-400">
            <p className="font-semibold">✅ {t("quote.approvedTitle")}</p>
            <p className="text-sm mt-1">{t("quote.approvedMessage")}</p>
          </div>
        )}

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

        {quote.status === "REJECTED" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-700 dark:text-red-400">
            <p className="font-semibold">{t("quote.rejectedTitle")}</p>
            <p className="text-sm mt-1">{t("quote.rejectedMessage")}</p>
          </div>
        )}
      </main>
    </div>
  )
}
