import Link from "next/link"
import { AlertCircle, Clock, CreditCard, ArrowRight } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

export default async function ExpiredPage() {
  const { tenantStatus } = await getTenant()
  const t = await getTranslations("expired")

  // If somehow active again, redirect to dashboard
  if (tenantStatus?.subscriptionStatus === "ACTIVE") redirect("/dashboard")

  // TRIAL chegando AQUI significa que o teste acabou: quem está dentro do prazo
  // nunca é redirecionado para esta tela (ver hasActiveSubscription).
  //
  // A distinção que falta a `subscriptionStatus` sozinho vem da DATA. Sem ela,
  // quem usou quinze dias leria "o ServiçoOS não tem período de teste" logo
  // depois de ter tido um — texto que já esteve certo, e que ficou mentindo
  // quando o teste voltou em 08/09/2026.
  const emTrial = tenantStatus?.subscriptionStatus === "TRIAL"
  const testeAcabou = emTrial && !!tenantStatus?.trialEndsAt
  // Empresa criada enquanto não havia teste: nunca teve prazo, nunca assinou.
  const neverSubscribed = emTrial && !tenantStatus?.trialEndsAt
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

        {testeAcabou && (
          <>
            <h1 className="text-2xl font-bold">{t("trialTerminou.title")}</h1>
            <p className="text-muted-foreground">{t("trialTerminou.desc")}</p>
          </>
        )}

        {neverSubscribed && (
          <>
            <h1 className="text-2xl font-bold">{t("neverSubscribed.title")}</h1>
            <p className="text-muted-foreground">{t("neverSubscribed.desc")}</p>
          </>
        )}
        {isPending && (
          <>
            <h1 className="text-2xl font-bold">{t("pending.title")}</h1>
            <p className="text-muted-foreground">{t("pending.desc")}</p>
          </>
        )}
        {isCancelled && (
          <>
            <h1 className="text-2xl font-bold">{t("cancelled.title")}</h1>
            <p className="text-muted-foreground">{t("cancelled.desc")}</p>
          </>
        )}
        {isPastDue && (
          <>
            <h1 className="text-2xl font-bold">{t("pastDue.title")}</h1>
            <p className="text-muted-foreground">{t("pastDue.desc")}</p>
          </>
        )}

        <div className="rounded-xl border bg-card p-6 space-y-4 text-left">
          <p className="text-sm font-semibold">{t("dataBox.title")}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✅ {t("dataBox.item1")}</li>
            <li>✅ {t("dataBox.item2")}</li>
            <li>✅ {t("dataBox.item3")}</li>
          </ul>
        </div>

        <Link
          href="/billing"
          className="inline-flex items-center gap-2 w-full justify-center rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <CreditCard className="size-5" />
          {isPending ? t("ctaPending") : t("ctaDefault")}
          <ArrowRight className="size-5" />
        </Link>

        <p className="text-xs text-muted-foreground">
          {t("helpQuestion")}{" "}
          <a href="mailto:suporte@servicoos.com.br" className="text-primary hover:underline">
            {t("helpLink")}
          </a>
        </p>
      </div>
    </div>
  )
}
