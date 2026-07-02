import Link from "next/link"
import { AlertCircle, CreditCard, ArrowRight } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export default async function ExpiredPage() {
  const { tenantId, tenantStatus } = await getTenant()

  // If somehow active again, redirect to dashboard
  if (tenantStatus?.subscriptionStatus === "ACTIVE") redirect("/dashboard")

  const isTrialExpired =
    tenantStatus?.subscriptionStatus === "TRIAL" &&
    tenantStatus.trialEndsAt &&
    new Date(tenantStatus.trialEndsAt) < new Date()

  const isCancelled = tenantStatus?.subscriptionStatus === "CANCELLED"
  const isPastDue = tenantStatus?.subscriptionStatus === "PAST_DUE"

  const tenant = isTrialExpired
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
    : null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="size-16 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center mx-auto">
          <AlertCircle className="size-8 text-orange-500" />
        </div>

        {isTrialExpired && (
          <>
            <h1 className="text-2xl font-bold">Seu período de teste encerrou</h1>
            <p className="text-muted-foreground">
              Os 15 dias grátis de <strong>{tenant?.name ?? "sua empresa"}</strong> chegaram ao fim.
              Assine um plano para continuar usando o ServiçoOS sem perder nenhum dado.
            </p>
          </>
        )}
        {isCancelled && (
          <>
            <h1 className="text-2xl font-bold">Assinatura cancelada</h1>
            <p className="text-muted-foreground">
              Sua assinatura foi cancelada. Para reativar o acesso, assine um novo plano.
              Todos os seus dados continuam salvos.
            </p>
          </>
        )}
        {isPastDue && (
          <>
            <h1 className="text-2xl font-bold">Pagamento pendente</h1>
            <p className="text-muted-foreground">
              Identificamos um problema com seu pagamento. Atualize seus dados de cobrança
              para reativar o acesso imediatamente.
            </p>
          </>
        )}

        <div className="rounded-xl border bg-card p-6 space-y-4 text-left">
          <p className="text-sm font-semibold">O que acontece com meus dados?</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✅ Todos os seus dados estão salvos e seguros</li>
            <li>✅ Ao assinar, o acesso é restaurado imediatamente</li>
            <li>✅ Sem taxa de reativação</li>
          </ul>
        </div>

        <Link
          href="/billing"
          className="inline-flex items-center gap-2 w-full justify-center rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <CreditCard className="size-5" />
          Ver planos e assinar
          <ArrowRight className="size-5" />
        </Link>

        <p className="text-xs text-muted-foreground">
          Dúvidas?{" "}
          <a href="mailto:suporte@servicoos.com.br" className="text-primary hover:underline">
            Fale conosco
          </a>
        </p>
      </div>
    </div>
  )
}
