import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getQuote, updateQuote, deleteQuote, updateQuoteStatus, clientesParaOrcamento, enviarOrcamentoPorEmail } from "@/actions/quotes"
import { EnviarPorEmail } from "@/components/shared/enviar-por-email"
import { QuoteForm } from "@/components/quotes/quote-form"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Pencil, Trash2, CheckCircle2, XCircle, Send, RotateCcw, FileDown } from "lucide-react"
import { OrcamentoFotos } from "@/components/quotes/orcamento-fotos"
import { getFotosDoOrcamento } from "@/actions/attachments"

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
}

function fmt(value: unknown) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString("pt-BR")
}

function quoteNum(number: number, createdAt: Date | string) {
  const year = new Date(createdAt).getFullYear()
  return `ORC${year}${String(number).padStart(4, "0")}`
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }

export default async function QuoteDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { edit } = await searchParams
  const quote = await getQuote(id)
  const fotos = await getFotosDoOrcamento(id)
  if (!quote) notFound()

  const t = await getTranslations("quotes")
  const tc = await getTranslations("common")

  const isEditing = edit === "1"
  const boundUpdate = updateQuote.bind(null, id)

  if (isEditing) {
    const clientes = await clientesParaOrcamento()
    return (
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/quotes/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            ← {tc("back")}
          </Link>
          <h1 className="text-2xl font-bold">{t("detail.editTitle", { number: quoteNum(quote.number, quote.createdAt) })}</h1>
        </div>
        <QuoteForm
          action={boundUpdate}
          clientes={clientes}
          quote={{
            ...quote,
            amount: quote.amount.toString(),
            validUntil: quote.validUntil?.toISOString() ?? null,
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{quoteNum(quote.number, quote.createdAt)}</h1>
            <Badge variant={statusVariant[quote.status]}>
              {tc(`quoteStatus.${quote.status}` as "quoteStatus.DRAFT")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t("detail.createdOn", { date: fmtDate(quote.createdAt) })}
            {quote.validUntil && ` · ${t("detail.validUntil", { date: fmtDate(quote.validUntil) })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/quote/${id}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileDown className="size-3.5 mr-1.5" />
            {t("detail.generatePdfButton")}
          </a>
          {/* "poder enviar direto para o email do cliente cadastrado". */}
          <EnviarPorEmail
            enviar={enviarOrcamentoPorEmail.bind(null, id)}
            jaEnviadoPara={quote.sentTo}
            jaEnviadoEm={quote.sentAt}
          />
          <Link href={`/quotes/${id}?edit=1`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil className="size-3.5 mr-1.5" />
            {tc("edit")}
          </Link>
          <form action={deleteQuote.bind(null, id)}>
            <Button variant="destructive" size="sm" type="submit">
              <Trash2 className="size-3.5 mr-1.5" />
              {tc("delete")}
            </Button>
          </form>
        </div>
      </div>

      {/* Status actions */}
      <div className="flex flex-wrap gap-2">
        {quote.status !== "SENT" && quote.status !== "APPROVED" && (
          <form action={updateQuoteStatus.bind(null, id, "SENT")}>
            <Button variant="outline" size="sm" type="submit">
              <Send className="size-3.5 mr-1.5" />
              {t("detail.actions.markSent")}
            </Button>
          </form>
        )}
        {quote.status !== "APPROVED" && (
          <form action={updateQuoteStatus.bind(null, id, "APPROVED")}>
            <Button variant="outline" size="sm" type="submit" className="text-green-600 border-green-600 hover:bg-green-600/10">
              <CheckCircle2 className="size-3.5 mr-1.5" />
              {t("detail.actions.approve")}
            </Button>
          </form>
        )}
        {quote.status !== "REJECTED" && (
          <form action={updateQuoteStatus.bind(null, id, "REJECTED")}>
            <Button variant="outline" size="sm" type="submit" className="text-destructive border-destructive hover:bg-destructive/10">
              <XCircle className="size-3.5 mr-1.5" />
              {t("detail.actions.reject")}
            </Button>
          </form>
        )}
        {quote.status !== "DRAFT" && (
          <form action={updateQuoteStatus.bind(null, id, "DRAFT")}>
            <Button variant="ghost" size="sm" type="submit">
              <RotateCcw className="size-3.5 mr-1.5" />
              {t("detail.actions.revertToDraft")}
            </Button>
          </form>
        )}
      </div>

      <Separator />

      {/* Cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">{t("detail.clientTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold text-base">{quote.clientName}</p>
          {quote.clientContact && <p>📞 {quote.clientContact}</p>}
          {quote.clientAddress && <p>📍 {quote.clientAddress}</p>}
        </CardContent>
      </Card>

      {/* Serviço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">{t("detail.serviceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium mb-1">{t("detail.whatNeedsToBeDone")}</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{quote.description}</p>
          </div>
          {quote.materials && (
            <div>
              <p className="font-medium mb-1">{t("detail.materialsLabel")}</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{quote.materials}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* As fotos do que sera feito.
          Ficam entre o SERVICO e os VALORES de proposito: e a ordem em que a
          pergunta se forma na cabeca de quem le — o que e, como esta, quanto
          custa. Foto depois do preco chega tarde. */}
      <OrcamentoFotos
        quoteId={quote.id}
        fotos={fotos}
        podeApagar
        bloqueado={quote.status === "APPROVED" || quote.status === "REJECTED"}
      />

      {/* Valores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">{t("detail.valuesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">{t("detail.totalAmountLabel")}</span>
            <span className="text-xl font-bold">{fmt(quote.amount)}</span>
          </div>
          {quote.notes && (
            <div className="pt-2">
              <p className="font-medium mb-1">{t("detail.notesLabel")}</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
