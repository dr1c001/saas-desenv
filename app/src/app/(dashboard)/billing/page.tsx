import { getBillingStatus, getPlans, subscribeToPlan } from "@/actions/billing"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { CheckCircle2, Clock, CreditCard, Zap } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { CancelSubscriptionButton } from "@/components/billing/cancel-button"
import { precoCheio, precoCobrado } from "@/lib/preco"

const STATUS_COLOR: Record<string, string> = {
  TRIAL: "bg-yellow-500",
  PENDING: "bg-blue-500",
  ACTIVE: "bg-green-500",
  PAST_DUE: "bg-red-500",
  CANCELLED: "bg-gray-500",
}

// Slugs que têm lista de features traduzida em messages/*.json — plano novo
// no banco sem entrada lá cai na lista vazia, igual ao fallback anterior
// (PLAN_FEATURES[plan.slug] ?? []).
//
// A lista em si mora no namespace compartilhado `planFeatures`, o mesmo que a
// landing usa. Antes cada tela tinha a própria cópia, e elas divergiram: o
// Enterprise aqui não dizia "Tudo do Pro", então nesta tela — justamente onde
// a pessoa decide pagar — o plano de R$ 397 aparecia sem Mapa GPS, Checklist,
// Assinatura digital nem Relatórios avançados, parecendo pior que o de R$ 197.
// (Notado pelo usuário em 10/08/2026.)
const PLAN_FEATURE_SLUGS = ["starter", "pro", "enterprise"]

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { success, error } = await searchParams
  const t = await getTranslations("billingReferral.billing")
  const tf = await getTranslations("planFeatures")
  const [billing, plans] = await Promise.all([getBillingStatus(), getPlans()])

  const statusKey = billing?.subscriptionStatus ?? "TRIAL"
  const statusColor = STATUS_COLOR[statusKey]
  // Preço mostrado aqui não batia com o que de fato ia pra Asaas em
  // subscribeToPlan quando havia desconto de indicação — cliente só
  // descobria o valor real já na página de pagamento da Asaas.
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  const discountPercent = billing?.referralDiscountPercent ?? 0
  // A mensalidade combinada com esta empresa, quando existe. A tela mostrava o
  // preço da TABELA enquanto a cobrança saía pelo combinado — o cliente via um
  // número e pagava outro. (Achado ao ligar o preço customizado, 22/08/2026.)
  const combinado = billing?.customPriceMonthly === null || billing?.customPriceMonthly === undefined
    ? null
    : Number(billing.customPriceMonthly)

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-600 bg-green-50 dark:bg-green-950 p-4 text-green-700 dark:text-green-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>{t("successMessage")}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 text-red-700 dark:text-red-300">
          <span className="font-medium">{t("errorPrefix")}</span>
          <span>{decodeURIComponent(error)}</span>
        </div>
      )}

      {/* Status atual */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <CreditCard className="size-5" />
            {t("statusTitle")}
          </h2>
          <span className={`px-3 py-1 rounded-full text-xs text-white font-medium ${statusColor}`}>
            {t(`subscriptionStatus.${statusKey}` as "subscriptionStatus.TRIAL")}
          </span>
        </div>

        {billing?.subscriptionStatus === "TRIAL" && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <Clock className="size-4" />
            <span className="text-sm">{t("trialHint")}</span>
          </div>
        )}

        {billing?.subscriptionStatus === "PENDING" && (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="size-4" />
            <span className="text-sm">
              {t("pendingHint")}
            </span>
          </div>
        )}

        {billing?.plan && (
          <p className="text-sm text-muted-foreground">
            {t("currentPlanLabel")}{" "}
            <span className="font-medium text-foreground">{billing.plan.name}</span>
          </p>
        )}

        {billing?.subscriptions[0] && (
          <p className="text-sm text-muted-foreground">
            {t("renewsOnLabel")}{" "}
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
        {/* O contrato vai anexado ao e-mail de confirmação de pagamento, mas
            e-mail se perde — aqui o cliente baixa de novo quando precisar. */}
        {billing?.plan && (
          <a
            href="/api/pdf/contrato"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4 mb-4"
          >
            {t("contract.download")}
          </a>
        )}

        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Zap className="size-5 text-yellow-500" />
          {t("plans.sectionTitle")}
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan = billing?.plan?.id === plan.id
            const features = PLAN_FEATURE_SLUGS.includes(plan.slug)
              ? (tf.raw(plan.slug) as string[])
              : []
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
                    {t("plans.mostPopular")}
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="mt-2">
                    {discountPercent > 0 && (
                      <span className="text-sm text-muted-foreground line-through mr-2">
                        {formatCurrency(
                          precoCheio(
                            { priceMonthly: Number(plan.priceMonthly), priceYearly: Number(plan.priceYearly) },
                            combinado,
                            "MONTHLY"
                          )
                        )}
                      </span>
                    )}
                    <span className="text-3xl font-bold">
                      {formatCurrency(
                        precoCobrado(
                          { priceMonthly: Number(plan.priceMonthly), priceYearly: Number(plan.priceYearly) },
                          combinado,
                          "MONTHLY",
                          discountPercent
                        )
                      )}
                    </span>
                    <span className="text-muted-foreground text-sm">{t("plans.perMonth")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("plans.yearlyNote", {
                      price: formatCurrency(
                        precoCobrado(
                          { priceMonthly: Number(plan.priceMonthly), priceYearly: Number(plan.priceYearly) },
                          combinado,
                          "YEARLY",
                          discountPercent
                        )
                      ),
                    })}
                  </p>
                  {combinado !== null && (
                    <p className="text-xs text-primary font-medium mt-1">{t("plans.agreedPrice")}</p>
                  )}
                  {discountPercent > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                      {t("plans.referralDiscount", { percent: discountPercent })}
                    </p>
                  )}
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
                    {t("plans.currentPlan")}
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
                        {t("plans.subscribeMonthly")}
                      </button>
                    </form>
                    <form action={subscribeToPlan}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="cycle" value="YEARLY" />
                      <button
                        type="submit"
                        className={buttonVariants({ variant: "ghost", className: "w-full text-xs" })}
                      >
                        {t("plans.subscribeYearly")}
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
        {t.rich("paymentNote", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
    </div>
  )
}
