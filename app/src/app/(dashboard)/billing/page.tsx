import { getBillingStatus, getPlans, subscribeToPlan } from "@/actions/billing"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { CheckCircle2, Clock, CreditCard, Zap } from "lucide-react"
import Link from "next/link"
import { CancelSubscriptionButton } from "@/components/billing/cancel-button"

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  TRIAL: { label: "Sem assinatura", color: "bg-yellow-500" },
  PENDING: { label: "Confirmando pagamento", color: "bg-blue-500" },
  ACTIVE: { label: "Ativo", color: "bg-green-500" },
  PAST_DUE: { label: "Pagamento pendente", color: "bg-red-500" },
  CANCELLED: { label: "Cancelado", color: "bg-gray-500" },
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["Até 3 usuários", "50 OS por mês", "Relatórios básicos", "Suporte por e-mail"],
  pro: ["Até 10 usuários", "OS ilimitadas", "Mapa GPS", "Checklist + Assinatura digital", "Emissão de NFS-e", "Relatórios avançados", "Suporte prioritário"],
  enterprise: ["Usuários ilimitados", "OS ilimitadas", "Emissão de NFS-e", "API de integração", "Suporte 24h"],
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { success, error } = await searchParams
  const [billing, plans] = await Promise.all([getBillingStatus(), getPlans()])

  const statusInfo = STATUS_LABEL[billing?.subscriptionStatus ?? "TRIAL"]

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Planos e Assinatura</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie seu plano e forma de pagamento.</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-600 bg-green-50 dark:bg-green-950 p-4 text-green-700 dark:text-green-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>Assinatura realizada com sucesso! A fatura para pagamento foi enviada por e-mail.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 text-red-700 dark:text-red-300">
          <span className="font-medium">Erro ao processar assinatura:</span>
          <span>{decodeURIComponent(error)}</span>
        </div>
      )}

      {/* Status atual */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <CreditCard className="size-5" />
            Status da assinatura
          </h2>
          <span className={`px-3 py-1 rounded-full text-xs text-white font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        {billing?.subscriptionStatus === "TRIAL" && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <Clock className="size-4" />
            <span className="text-sm">Escolha um plano abaixo para começar a usar o sistema.</span>
          </div>
        )}

        {billing?.subscriptionStatus === "PENDING" && (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="size-4" />
            <span className="text-sm">
              Aguardando confirmação do pagamento — o acesso libera automaticamente assim que confirmar.
            </span>
          </div>
        )}

        {billing?.plan && (
          <p className="text-sm text-muted-foreground">
            Plano atual: <span className="font-medium text-foreground">{billing.plan.name}</span>
          </p>
        )}

        {billing?.subscriptions[0] && (
          <p className="text-sm text-muted-foreground">
            Renova em:{" "}
            <span className="font-medium text-foreground">
              {new Date(billing.subscriptions[0].currentPeriodEnd).toLocaleDateString("pt-BR")}
            </span>
          </p>
        )}

        {billing?.subscriptionStatus === "ACTIVE" && (
          <div className="pt-2">
            <CancelSubscriptionButton />
          </div>
        )}
      </div>

      {/* Planos */}
      <div>
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Zap className="size-5 text-yellow-500" />
          Escolha seu plano
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan = billing?.plan?.id === plan.id
            const features = PLAN_FEATURES[plan.slug] ?? []
            const isPro = plan.slug === "pro"

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border bg-card p-6 flex flex-col gap-4 ${
                  isPro ? "border-primary ring-2 ring-primary" : ""
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-medium">
                    Mais popular
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">
                      {formatCurrency(Number(plan.priceMonthly))}
                    </span>
                    <span className="text-muted-foreground text-sm">/mês</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou {formatCurrency(Number(plan.priceYearly))}/ano (2 meses grátis)
                  </p>
                </div>

                <ul className="space-y-2 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <span className="text-center text-sm text-muted-foreground border rounded-lg py-2">
                    Plano atual
                  </span>
                ) : (
                  <div className="space-y-2">
                    <form action={subscribeToPlan}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="cycle" value="MONTHLY" />
                      <button
                        type="submit"
                        className={buttonVariants({ variant: isPro ? "default" : "outline", className: "w-full" })}
                      >
                        Assinar — Mensal
                      </button>
                    </form>
                    <form action={subscribeToPlan}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="cycle" value="YEARLY" />
                      <button
                        type="submit"
                        className={buttonVariants({ variant: "ghost", className: "w-full text-xs" })}
                      >
                        Assinar — Anual (economize 2 meses)
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Pagamentos processados com segurança via <strong>Asaas</strong>. Aceitamos boleto e cartão de crédito.
        Cancele a qualquer momento.
      </p>
    </div>
  )
}
