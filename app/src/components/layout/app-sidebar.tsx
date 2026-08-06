"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
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
  CreditCard,
  Search,
  X,
  Gift,
  Landmark,
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
import { ThemeToggle } from "@/components/layout/theme-toggle"

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
  { title: "Assinatura", href: "/billing", icon: CreditCard, slug: "billing" },
  { title: "Indicação", href: "/referral", icon: Gift, slug: "referral" },
  // "fiscal" já existia em ALL_TABS (lib/auth.ts) e era atribuível em
  // Permissões, mas não tinha link em lugar nenhum da UI — ninguém
  // conseguia chegar em /settings/fiscal pra configurar a emissão de NFS-e,
  // apesar da mensagem de erro de emitNfse dizer "Configurações → Fiscal".
  // (Achado em auditoria pré-venda, 2026-08-05.)
  { title: "Config. Fiscal", href: "/settings/fiscal", icon: Landmark, slug: "fiscal" },
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
  const [search, setSearch] = useState("")

  const visibleItems = NAV_ITEMS.filter((item) => allowedSet.has(item.slug))
  const filteredItems = search.trim()
    ? visibleItems.filter((item) =>
        item.title.toLowerCase().includes(search.toLowerCase())
      )
    : visibleItems

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
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">ServiçoOS</span>
          <Badge variant="outline" className="text-xs">
            {roleLabel[role] ?? role}
          </Badge>
        </div>
        {/* Barra de pesquisa */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar aba..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border bg-background px-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {search ? `Resultados (${filteredItems.length})` : "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma aba encontrada.</p>
              )}
              {filteredItems.map((item) => (
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
          <ThemeToggle />
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
