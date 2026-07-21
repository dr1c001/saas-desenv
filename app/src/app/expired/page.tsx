import Link from "next/link"
import { AlertCircle, Clock, CreditCard, ArrowRight } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function ExpiredPage() {
  const { tenantStatus } = await getTenant()

  // If somehow active again, redirect to dashboard
  if (tenantStatus?.subscriptionStatus === "ACTIVE") redirect("/dashboard")

  // Sem trial: TRIAL aqui significa "nunca assinou", não "trial expirado".
  const neverSubscribed = tenantStatus?.subscriptionStatus === "TRIAL"
  const isPending = tenantStatus?.subscriptionStatus === "PENDING"
  const isCancelled = tenantStatus?.subscriptionStatus === "CANCELLED"
  const isPastDue = tenantStatus?.subscriptionStatus === "PAST_DUE"

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className={`size-16 rounded-full flex items-center justify-center mx-auto ${
          isPending ? "bg-blue-100 dark:bg-blue-950" : "bg-orange-100 dark:bg-orange-950"
        }`}>
          {isPending
            ? <Clock className="size-8 text-blue-500" />
            : <AlertCircle className="size-8 text-orange-500" />}
        </div>

        {neverSubscribed && (
          <>
            <h1 className="text-2xl font-bold">Assine um plano para começar</h1>
            <p className="text-muted-foreground">
              O ServiçoOS não tem período de teste — escolha um dos planos abaixo para liberar o acesso ao sistema.
            </p>
          </>
        )}
        {isPending && (
          <>
            <h1 className="text-2xl font-bold">Confirmando seu pagamento</h1>
            <p className="text-muted-foreground">
              Recebemos sua assinatura e estamos aguardando a confirmação do pagamento.
              Geralmente leva só alguns instantes — assim que confirmar, seu acesso é liberado automaticamente.
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
              Identificamos um problema com seu pagamento e o prazo de carência já passou.
              Atualize seus dados de cobrança para reativar o acesso imediatamente.
            </p>
          </>
        )}

        <div className="rounded-xl border bg-card p-6 space-y-4 text-left">
          <p className="text-sm font-semibold">O que acontece com meus dados?</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✅ Todos os seus dados estão salvos e seguros</li>
            <li>✅ Ao confirmar o pagamento, o acesso é restaurado imediatamente</li>
            <li>✅ Sem taxa de reativação</li>
          </ul>
        </div>

        <Link
          href="/billing"
          className="inline-flex items-center gap-2 w-full justify-center rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <CreditCard className="size-5" />
          {isPending ? "Ver status da assinatura" : "Ver planos e assinar"}
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
