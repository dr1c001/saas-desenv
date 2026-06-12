import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-4 gap-2">
          <SidebarTrigger />
        </header>
        <Suspense>
          <OverdueAlerts />
        </Suspense>
        <div className="flex-1 p-6">{children}</div>
      </main>
    </SidebarProvider>
  )
}
