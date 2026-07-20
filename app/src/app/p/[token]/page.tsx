import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, Wrench, FileCheck2, XCircle, Star } from "lucide-react"
import { SignaturePadPublic } from "@/components/service-orders/signature-pad-public"
import { NpsWidget } from "@/components/portal/nps-widget"
import { formatCurrency } from "@/lib/utils"

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  OPEN:        { label: "Aguardando atendimento", icon: Clock,       color: "text-blue-500" },
  IN_PROGRESS: { label: "Em andamento",           icon: Wrench,      color: "text-yellow-500" },
  DONE:        { label: "Concluída",              icon: CheckCircle2, color: "text-green-500" },
  INVOICED:    { label: "Faturada",               icon: FileCheck2,  color: "text-purple-500" },
  CANCELLED:   { label: "Cancelada",              icon: XCircle,     color: "text-red-500" },
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const order = await prisma.serviceOrder.findUnique({
    where: { clientToken: token },
    include: {
      items: true,
      tenant: { select: { name: true, phone: true, logoUrl: true } },
      client: { select: { name: true } },
      technician: { select: { name: true } },
    },
  })

  if (!order) notFound()

  const cfg = statusConfig[order.status] ?? statusConfig.OPEN
  const Icon = cfg.icon
  const year = new Date(order.createdAt).getFullYear()
  const osNum = `OS${year}${String(order.number).padStart(4, "0")}`
  const isDone = order.status === "DONE" || order.status === "INVOICED"

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Acompanhe sua Ordem de Serviço</p>
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
              <p className="text-lg font-bold">{cfg.label}</p>
              <p className="text-sm text-muted-foreground">{osNum} — {order.title}</p>
              {order.technician && (
                <p className="text-sm text-muted-foreground">Responsável: {order.technician.name}</p>
              )}
              {order.scheduledAt && (
                <Badge variant="outline">
                  Agendada: {new Date(order.scheduledAt).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        {order.description && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Descrição do serviço</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{order.description}</p></CardContent>
          </Card>
        )}

        {/* Conclusion note */}
        {order.conclusionNote && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Serviços realizados</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{order.conclusionNote}</p></CardContent>
          </Card>
        )}

        {/* Items */}
        {order.items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Itens e valores</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descrição</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
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
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(Number(order.totalAmount))}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Signature */}
        {isDone && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Confirmação de execução</CardTitle></CardHeader>
            <CardContent>
              <SignaturePadPublic orderId={order.id} existingSignatureUrl={order.clientSignatureUrl} />
            </CardContent>
          </Card>
        )}

        {/* NPS */}
        {isDone && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Star className="size-4" />
                Avalie o atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NpsWidget orderId={order.id} clientToken={token} existingScore={order.npsScore} existingFeedback={order.npsFeedback} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
