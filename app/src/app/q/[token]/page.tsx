import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { QuoteApprovalButtons } from "@/components/portal/quote-approval-buttons"

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT:    { label: "Rascunho",   color: "secondary" },
  SENT:     { label: "Aguardando aprovação", color: "default" },
  APPROVED: { label: "Aprovado ✓", color: "default" },
  REJECTED: { label: "Recusado",  color: "destructive" },
}

export default async function QuotePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const quote = await prisma.quote.findUnique({
    where: { clientToken: token },
    include: { tenant: { select: { name: true, phone: true } } },
  })

  if (!quote) notFound()

  const cfg = statusLabels[quote.status] ?? statusLabels.SENT
  const year = new Date(quote.createdAt).getFullYear()
  const quoteNum = `ORC${year}${String(quote.number).padStart(4, "0")}`
  const isPending = quote.status === "SENT" || quote.status === "DRAFT"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Orçamento digital</p>
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
              <Badge variant={cfg.color as "default" | "secondary" | "destructive" | "outline"}>{cfg.label}</Badge>
            </div>
            <p className="text-muted-foreground">Para: {quote.clientName}</p>
            {quote.validUntil && (
              <p className="text-sm text-muted-foreground">
                Válido até: {new Date(quote.validUntil).toLocaleDateString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Descrição</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{quote.description}</p></CardContent>
        </Card>

        {quote.materials && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Materiais</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{quote.materials}</p></CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Valor total</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(Number(quote.amount))}</p>
            </div>
            {quote.notes && <p className="text-xs text-muted-foreground mt-2">{quote.notes}</p>}
          </CardContent>
        </Card>

        {isPending && (
          <QuoteApprovalButtons quoteId={quote.id} />
        )}

        {quote.status === "APPROVED" && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center text-green-700 dark:text-green-400">
            <p className="font-semibold">✅ Orçamento aprovado!</p>
            <p className="text-sm mt-1">Entraremos em contato para agendar o serviço.</p>
          </div>
        )}

        {quote.status === "REJECTED" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-700 dark:text-red-400">
            <p className="font-semibold">Orçamento recusado</p>
            <p className="text-sm mt-1">Entre em contato conosco se quiser revisar as condições.</p>
          </div>
        )}
      </main>
    </div>
  )
}
