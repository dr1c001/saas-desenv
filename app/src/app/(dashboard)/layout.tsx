import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"
import { PushSubscriber } from "@/components/layout/push-subscriber"
import { LocationTracker } from "@/components/layout/location-tracker"
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker"
import { OfflineBanner } from "@/components/layout/offline-banner"
import { ImpersonationBanner } from "@/components/layout/impersonation-banner"
import { getTenant, getAllowedTabs, hasActiveSubscription } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/admin"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, role, userId } = await getTenant()

  // Sem trial: acesso exige assinatura ACTIVE (ou PAST_DUE dentro da carência
  // — ver hasActiveSubscription em lib/auth.ts, usada também por toda Server
  // Action sensível via requireActiveSubscription, pra não depender só deste
  // bloqueio de página). /billing e /settings ficam sempre acessíveis —
  // subscribeToPlan exige tenant.document, que só é preenchido em /settings,
  // então bloquear as duas rotas junto criava um beco sem saída: ninguém
  // bloqueado conseguia chegar em /settings pra preencher o documento exigido
  // por /billing (achado testando o fluxo de ponta a ponta, 21/07/2026).
  // /expired (o destino do redirect) vive fora deste layout.
  const pathname = (await headers()).get("x-pathname") ?? ""
  const isExemptPage = pathname.startsWith("/billing") || pathname.startsWith("/settings")

  if (!isExemptPage && !(await hasActiveSubscription(tenantId))) {
    redirect("/expired")
  }

  const allowedTabs = await getAllowedTabs(tenantId, role)
  const souDono = await isSuperAdmin()

  return (
    <SidebarProvider>
      <AppSidebar allowedTabs={allowedTabs} role={role} userId={userId} isSuperAdmin={souDono} />
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-4 gap-2">
          <SidebarTrigger />
        </header>
        {/* Antes de tudo: se o dono da plataforma estiver vendo como um
            cliente, ele precisa saber disso o tempo todo. */}
        <ImpersonationBanner />
        <OfflineBanner />
        <Suspense>
          <OverdueAlerts tenantId={tenantId} />
        </Suspense>
        <div className="flex-1 p-6">{children}</div>
      </main>
      {/* Client-side services (service worker + push + GPS) */}
      <ServiceWorkerRegistrar />
      <PushSubscriber />
      <LocationTracker />
    </SidebarProvider>
  )
}
