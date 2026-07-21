import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Users, Building2, TrendingUp, AlertCircle, CheckCircle2, Clock } from "lucide-react"

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  TRIAL:     { label: "Sem assinatura", variant: "secondary" },
  PENDING:   { label: "Confirmando pagamento", variant: "secondary" },
  ACTIVE:    { label: "Ativo",      variant: "default" },
  PAST_DUE:  { label: "Inadimplente", variant: "destructive" },
  CANCELLED: { label: "Cancelado",  variant: "outline" },
}

export default async function AdminPage() {
  const tenants = await prisma.tenant.findMany({
    include: {
      plan: { select: { name: true, priceMonthly: true } },
      users: { select: { id: true, role: true } },
      _count: { select: { orders: true, clients: true, quotes: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { billingCycle: true, currentPeriodEnd: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.subscriptionStatus === "ACTIVE").length,
    trial: tenants.filter(t => t.subscriptionStatus === "TRIAL").length,
    pastDue: tenants.filter(t => t.subscriptionStatus === "PAST_DUE").length,
    mrr: tenants
      .filter(t => t.subscriptionStatus === "ACTIVE" && t.plan)
      .reduce((sum, t) => {
        const sub = t.subscriptions[0]
        const price = Number(t.plan!.priceMonthly)
        return sum + (sub?.billingCycle === "YEARLY" ? price : price)
      }, 0),
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="size-3.5"/>Empresas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="size-3.5 text-green-500"/>Ativos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{stats.active}</p></CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3.5 text-yellow-500"/>Sem assinatura</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">{stats.trial}</p></CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="size-3.5 text-red-500"/>Inadimplentes</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{stats.pastDue}</p></CardContent>
        </Card>
        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3.5 text-purple-500"/>MRR</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-purple-600">{formatCurrency(stats.mrr)}</p></CardContent>
        </Card>
      </div>

      {/* Tabela de tenants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            Todos os clientes ({tenants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Empresa</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Plano</th>
                  <th className="text-center px-4 py-3 font-medium">Usuários</th>
                  <th className="text-center px-4 py-3 font-medium">OS</th>
                  <th className="text-center px-4 py-3 font-medium">Clientes</th>
                  <th className="text-left px-4 py-3 font-medium">Renova</th>
                  <th className="text-left px-4 py-3 font-medium">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant, i) => {
                  const cfg = STATUS_CONFIG[tenant.subscriptionStatus] ?? STATUS_CONFIG.TRIAL
                  const sub = tenant.subscriptions[0]
                  const owner = tenant.users.find(u => u.role === "OWNER")

                  const dateLabel = sub?.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")
                    : "—"

                  return (
                    <tr key={tenant.id} className={`border-b hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{tenant.name}</p>
                        {tenant.document && <p className="text-xs text-muted-foreground">{tenant.document}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {tenant.plan ? (
                          <div>
                            <p className="font-medium">{tenant.plan.name}</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(Number(tenant.plan.priceMonthly))}/mês</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem plano</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{tenant.users.length}</td>
                      <td className="px-4 py-3 text-center">{tenant._count.orders}</td>
                      <td className="px-4 py-3 text-center">{tenant._count.clients}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(tenant.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhuma empresa cadastrada ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
