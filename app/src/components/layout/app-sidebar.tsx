"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useTranslations } from "next-intl"
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
  ShieldAlert,
  FileText,
  CreditCard,
  Search,
  X,
  Gift,
  Landmark,
  ListPlus,
  Building2,
  Languages,
  Plug,
  CalendarSync,
  Package,
  ShoppingCart,
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
import { BuscaAbas } from "@/components/layout/busca-abas"

const NAV_ITEMS: { titleKey: string; href: string; icon: React.ElementType; slug: TabSlug }[] = [
  { titleKey: "dashboard", href: "/dashboard", icon: LayoutDashboard, slug: "dashboard" },
  { titleKey: "clients", href: "/clients", icon: Users, slug: "clients" },
  { titleKey: "quotes", href: "/quotes", icon: FileText, slug: "quotes" },
  { titleKey: "serviceOrders", href: "/service-orders", icon: ClipboardList, slug: "service-orders" },
  { titleKey: "contracts", href: "/contracts", icon: CalendarSync, slug: "contracts" },
  { titleKey: "history", href: "/history", icon: History, slug: "history" },
  { titleKey: "maintenance", href: "/maintenance", icon: Wrench, slug: "maintenance" },
  { titleKey: "providers", href: "/providers", icon: HardHat, slug: "providers" },
  { titleKey: "receipts", href: "/receipts", icon: Receipt, slug: "receipts" },
  { titleKey: "schedule", href: "/schedule", icon: CalendarDays, slug: "schedule" },
  { titleKey: "finance", href: "/finance", icon: DollarSign, slug: "finance" },
  { titleKey: "reports", href: "/reports", icon: BarChart2, slug: "reports" },
  { titleKey: "team", href: "/team", icon: UserCog, slug: "team" },
  { titleKey: "map", href: "/map", icon: MapPin, slug: "map" },
  { titleKey: "parts", href: "/parts", icon: Package, slug: "parts" },
  { titleKey: "purchases", href: "/purchases", icon: ShoppingCart, slug: "purchases" },
  { titleKey: "billing", href: "/billing", icon: CreditCard, slug: "billing" },
  { titleKey: "referral", href: "/referral", icon: Gift, slug: "referral" },
  // "fiscal" já existia em ALL_TABS (lib/auth.ts) e era atribuível em
  // Permissões, mas não tinha link em lugar nenhum da UI — ninguém
  // conseguia chegar em /settings/fiscal pra configurar a emissão de NFS-e,
  // apesar da mensagem de erro de emitNfse dizer "Configurações → Fiscal".
  // (Achado em auditoria pré-venda, 2026-08-05.)
  { titleKey: "fiscal", href: "/settings/fiscal", icon: Landmark, slug: "fiscal" },
]

type Props = {
  allowedTabs: TabSlug[]
  role: string
  userId: string
  /** Dono da plataforma (não do tenant). Só ele vê o link do painel. */
  isSuperAdmin?: boolean
  /** A API é recurso do Enterprise. O link não aparece para quem não tem —
   *  mostrar e mandar para a tela de planos ao clicar é propaganda disfarçada
   *  de funcionalidade. */
  temApi?: boolean
  /** Filiais também é recurso do Enterprise. Mesmo motivo do temApi. */
  temFiliais?: boolean
}

export function AppSidebar({ allowedTabs, role, isSuperAdmin, temApi, temFiliais }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations()
  const allowedSet = new Set(allowedTabs)
  const [search, setSearch] = useState("")

  const visibleItems = NAV_ITEMS.filter((item) => allowedSet.has(item.slug))
  const filteredItems = search.trim()
    ? visibleItems.filter((item) =>
        t(`nav.${item.titleKey}` as "nav.dashboard").toLowerCase().includes(search.toLowerCase())
      )
    : visibleItems

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // O modo offline guarda HTML já renderizado com dados da empresa
    // (clientes, OS, valores). Num celular compartilhado entre técnicos, sair
    // da conta tem que levar isso junto — senão o próximo a usar abre o app
    // sem sinal e vê a carteira de quem saiu. Falha aqui não pode travar o
    // logout em si.
    try {
      const caches_ = await caches.keys()
      await Promise.all(caches_.filter((n) => n.startsWith("servicoos-")).map((n) => caches.delete(n)))
      navigator.serviceWorker?.controller?.postMessage({ tipo: "LIMPAR_CACHE" })
    } catch {}
    router.push("/login")
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">ServiçoOS</span>
          <Badge variant="outline" className="text-xs">
            {t(`common.roles.${role}` as "common.roles.OWNER")}
          </Badge>
        </div>
        {/* Barra de pesquisa */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t("nav.searchPlaceholder")}
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

      {/* A busca por número ou nome. Fica no topo do conteúdo, e não no
          cabeçalho, para não competir com o nome da empresa. */}
      <BuscaAbas
        abasPermitidas={allowedTabs}
        ehAdmin={role === "OWNER" || role === "ADMIN"}
      />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {search ? t("nav.resultsCount", { count: filteredItems.length }) : t("nav.menu")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("nav.noResults")}</p>
              )}
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <item.icon className="size-4" />
                    <span>{t(`nav.${item.titleKey}` as "nav.dashboard")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* Tema é preferência do dispositivo (só de quem está usando), então
              fica aqui. Idioma é decisão da empresa inteira e vive em
              Configurações, com confirmação — um clique acidental aqui já
              deixou a conta de uma cliente em inglês. (Ver seção 7.2.1.) */}
          <ThemeToggle />
          {/* O painel do dono da plataforma existia desde sempre, mas sem link
              nenhum em lugar nenhum — só se chegava digitando /admin na barra
              de endereço. (Notado pelo usuário em 10/08/2026.) */}
          {isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/admin" />}>
                <ShieldAlert className="size-4" />
                <span>{t("nav.platformAdmin")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {(role === "OWNER" || role === "ADMIN") && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/permissions" />}>
                <Shield className="size-4" />
                <span>{t("nav.permissions")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {(role === "OWNER" || role === "ADMIN") && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/fields" />}>
                <ListPlus className="size-4" />
                <span>{t("nav.customFields")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {(role === "OWNER" || role === "ADMIN") && temFiliais && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/filiais" />}>
                <Building2 className="size-4" />
                <span>{t("nav.filiais")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {(role === "OWNER" || role === "ADMIN") && temApi && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/api" />}>
                <Plug className="size-4" />
                <span>{t("nav.apiKeys")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {(role === "OWNER" || role === "ADMIN") && (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/vocabulary" />}>
                <Languages className="size-4" />
                <span>{t("nav.vocabulary")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/settings" />}>
              <Settings className="size-4" />
              <span>{t("nav.settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span>{t("nav.signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
