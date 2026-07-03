import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"
import { PushSubscriber } from "@/components/layout/push-subscriber"
import { LocationTracker } from "@/components/layout/location-tracker"
import { getTenant, getAllowedTabs } from "@/lib/auth"
import { TrialBanner } from "@/components/layout/trial-banner"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, role, userId, tenantStatus } = await getTenant()

  // Block access when trial expired, cancelled or past_due — except /billing, so a
  // blocked tenant can still reach the page that lets them buy a plan and unblock
  // themselves. /expired (the redirect target) lives outside this layout.
  const pathname = (await headers()).get("x-pathname") ?? ""
  const isBillingPage = pathname.startsWith("/billing")

  const trialExpired =
    tenantStatus?.subscriptionStatus === "TRIAL" &&
    tenantStatus.trialEndsAt &&
    new Date(tenantStatus.trialEndsAt) < new Date()
  const accessBlocked =
    trialExpired ||
    tenantStatus?.subscriptionStatus === "CANCELLED" ||
    tenantStatus?.subscriptionStatus === "PAST_DUE"

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
        <TrialBanner tenantStatus={tenantStatus} />
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
