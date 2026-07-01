import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"
import { PushSubscriber } from "@/components/layout/push-subscriber"
import { LocationTracker } from "@/components/layout/location-tracker"
import { getTenant, getAllowedTabs } from "@/lib/auth"
import { TrialBanner } from "@/components/layout/trial-banner"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, role, userId } = await getTenant()
  const allowedTabs = await getAllowedTabs(tenantId, role)

  return (
    <SidebarProvider>
      <AppSidebar allowedTabs={allowedTabs} role={role} userId={userId} />
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-4 gap-2">
          <SidebarTrigger />
        </header>
        <Suspense>
          <TrialBanner />
        </Suspense>
        <Suspense>
          <OverdueAlerts />
        </Suspense>
        <div className="flex-1 p-6">{children}</div>
      </main>
      {/* Client-side services (push + GPS) */}
      <PushSubscriber />
      <LocationTracker />
    </SidebarProvider>
  )
}
