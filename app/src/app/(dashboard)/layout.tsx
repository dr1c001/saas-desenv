import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"
import { PushSubscriber } from "@/components/layout/push-subscriber"
import { LocationTracker } from "@/components/layout/location-tracker"
import { getTenant, getAllowedTabs } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

// Dias de carência após o fim do período pago antes de bloquear de vez um
// tenant PAST_DUE — evita perder cliente por uma falha pontual de cobrança
// (cartão expirado, saldo momentâneo) que uma nova tentativa resolveria.
const PAST_DUE_GRACE_DAYS = 3

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, role, userId, tenantStatus } = await getTenant()

  // Sem trial: acesso exige assinatura ACTIVE. Um tenant recém-criado (status
  // TRIAL, nunca assinou), PENDING (assinou, aguardando confirmação do
  // Asaas) ou CANCELLED fica bloqueado imediatamente. PAST_DUE tem os dias de
  // carência acima antes de bloquear. /billing fica sempre acessível, pra um
  // tenant bloqueado poder se pagar e se desbloquear sozinho. /expired (o
  // destino do redirect) vive fora deste layout.
  const pathname = (await headers()).get("x-pathname") ?? ""
  const isBillingPage = pathname.startsWith("/billing")

  let accessBlocked = tenantStatus?.subscriptionStatus !== "ACTIVE"

  if (accessBlocked && tenantStatus?.subscriptionStatus === "PAST_DUE") {
    const latestSub = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { currentPeriodEnd: true },
    })
    if (latestSub) {
      const graceEnd = new Date(latestSub.currentPeriodEnd)
      graceEnd.setDate(graceEnd.getDate() + PAST_DUE_GRACE_DAYS)
      accessBlocked = new Date() >= graceEnd
    }
  }

  if (accessBlocked && !isBillingPage) {
    redirect("/expired")
  }

  const allowedTabs = await getAllowedTabs(tenantId, role)

  return (
    <SidebarProvider>
      <AppSidebar allowedTabs={allowedTabs} role={role} userId={userId} />
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-4 gap-2">
          <SidebarTrigger />
        </header>
        <Suspense>
          <OverdueAlerts tenantId={tenantId} />
        </Suspense>
        <div className="flex-1 p-6">{children}</div>
      </main>
      {/* Client-side services (push + GPS) */}
      <PushSubscriber />
      <LocationTracker />
    </SidebarProvider>
  )
}
