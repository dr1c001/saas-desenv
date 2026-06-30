"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  DollarSign,
  CalendarDays,
  BarChart2,
  Settings,
  LogOut,
  History,
  Receipt,
  Wrench,
  HardHat,
  UserCog,
  MapPin,
  Shield,
  FileText,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { TabSlug } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS: { title: string; href: string; icon: React.ElementType; slug: TabSlug }[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, slug: "dashboard" },
  { title: "Clientes", href: "/clients", icon: Users, slug: "clients" },
  { title: "Orçamentos", href: "/quotes", icon: FileText, slug: "quotes" },
  { title: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList, slug: "service-orders" },
  { title: "Histórico", href: "/history", icon: History, slug: "history" },
  { title: "Manutenção Interna", href: "/maintenance", icon: Wrench, slug: "maintenance" },
  { title: "Prestadores", href: "/providers", icon: HardHat, slug: "providers" },
  { title: "Recibos", href: "/receipts", icon: Receipt, slug: "receipts" },
  { title: "Agendamento", href: "/schedule", icon: CalendarDays, slug: "schedule" },
  { title: "Financeiro", href: "/finance", icon: DollarSign, slug: "finance" },
  { title: "Relatórios", href: "/reports", icon: BarChart2, slug: "reports" },
  { title: "Equipe", href: "/team", icon: UserCog, slug: "team" },
  { title: "Mapa GPS", href: "/map", icon: MapPin, slug: "map" },
]

type Props = {
  allowedTabs: TabSlug[]
  role: string
  userId: string
}

export function AppSidebar({ allowedTabs, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const allowedSet = new Set(allowedTabs)

  const visibleItems = NAV_ITEMS.filter((item) => allowedSet.has(item.slug))

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const roleLabel: Record<string, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    TECHNICIAN: "Técnico",
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">ServiçoOS</span>
          <Badge variant="outline" className="text-xs">
            {roleLabel[role] ?? role}
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {(role === "OWNER" || role === "ADMIN") && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/permissions" />}>
                <Shield className="size-4" />
                <span>Permissões</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/settings" />}>
              <Settings className="size-4" />
              <span>Configurações</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
