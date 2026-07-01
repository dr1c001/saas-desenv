import Link from "next/link"
import { Clock, AlertTriangle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function TrialBanner() {
  const { tenantId } = await getTenant()

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  })

  if (!tenant || tenant.subscriptionStatus !== "TRIAL") return null

  const daysLeft = tenant.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0

  const expired = daysLeft === 0

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm ${
        expired
          ? "bg-red-600 text-white"
          : daysLeft <= 3
          ? "bg-orange-500 text-white"
          : "bg-yellow-400 text-yellow-900"
      }`}
    >
      <div className="flex items-center gap-2">
        {expired ? <AlertTriangle className="size-4 shrink-0" /> : <Clock className="size-4 shrink-0" />}
        {expired
          ? "Seu período de teste expirou. Assine um plano para continuar usando o sistema."
          : `Você está no período de teste gratuito — ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""}.`}
      </div>
      <Link
        href="/billing"
        className="ml-4 shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
      >
        Ver planos →
      </Link>
    </div>
  )
}
