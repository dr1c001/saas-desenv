"use client"

import Link from "next/link"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
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
  Gift,
  Landmark,
  ListPlus,
  Building2,
  Languages,
  Plug,
  CalendarSync,
  Package,
  ShoppingCart,
  ReceiptText,
  Scale,
  Calculator,
  Boxes,
  CircleQuestionMark,
  ArrowLeft,
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
  useSidebar,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { TabSlug } from "@/lib/auth"
import {
  codigoDaAba,
  codigoDaRota,
  codigoDaTelaAtual,
  compararCodigo,
} from "@/lib/codigos-abas"
import { ancoraDoCodigo } from "@/lib/manual"
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
  { titleKey: "notas", href: "/notas", icon: ReceiptText, slug: "notas" },
  { titleKey: "cotacoes", href: "/cotacoes", icon: Scale, slug: "cotacoes" },
  { titleKey: "billing", href: "/billing", icon: CreditCard, slug: "billing" },
  { titleKey: "bens", href: "/bens", icon: Boxes, slug: "bens" },
  { titleKey: "balanco", href: "/balanco", icon: Calculator, slug: "balanco" },
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
  /** Filiais é ADICIONAL desde 25/08/2026 — vendido à parte, em qualquer
   *  plano. O link some para quem não contratou, mesmo motivo do temApi. */
  temFiliais?: boolean
}

/** O número da tela, na frente do nome. Fonte monoespaçada e largura fixa para
 *  os números formarem coluna — é o que deixa a lista escaneável pelo código. */
function Codigo({ valor }: { valor: string | null }) {
  if (!valor) return null
  return (
    <span className="w-9 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
      {valor}
    </span>
  )
}

export function AppSidebar({ allowedTabs, role, isSuperAdmin, temApi, temFiliais }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations()
  const { isMobile, setOpenMobile } = useSidebar()

  // FECHA O MENU AO NAVEGAR — no celular.
  //
  // No desktop o menu é uma coluna fixa e continuar aberto é o certo. No
  // celular ele é uma gaveta por cima da tela, e nada a fechava: quem tocasse
  // numa aba via a página trocar ATRÁS da gaveta e continuava olhando para o
  // menu, sem entender se o toque funcionou. A única saída era tocar fora.
  //
  // Fechavam sozinhas só as abas que saem deste layout (o painel do dono, por
  // exemplo), porque aí o provedor do menu desmonta junto — o que explica por
  // que umas fechavam e outras não, sem padrão aparente.
  //
  // Reagir ao `pathname` cobre TODOS os caminhos de uma vez: os links do menu,
  // os da administração, o rodapé, a ajuda e a busca de abas — inclusive os
  // que ainda não existem.
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [pathname, isMobile, setOpenMobile])

  /** Para o toque na aba em que já se está: o `pathname` não muda, então o
   *  efeito acima não dispara, e sem isto o menu ficaria aberto justamente no
   *  caso em que a pessoa não vê nada acontecer. */
  const fecharNoMobile = () => {
    if (isMobile) setOpenMobile(false)
  }
  const allowedSet = new Set(allowedTabs)
  const ehAdmin = role === "OWNER" || role === "ADMIN"

  // A ajuda abre no verbete da tela em que a pessoa ESTÁ. Manual que abre no
  // começo obriga a procurar de novo o que ela já tinha na frente.
  const codigoAtual = codigoDaTelaAtual(pathname)
  const ajudaDaqui = codigoAtual ? `/ajuda#${ancoraDoCodigo(codigoAtual)}` : "/ajuda"

  // Ordenado PELO CÓDIGO. Com o número à vista, a ordem antiga (1.6, 2.1, 3.2,
  // 1.1, 2.2…) faria a numeração parecer aleatória e tiraria o sentido de
  // mostrá-la. Em ordem, o menu e os atalhos contam a mesma história.
  const visibleItems = NAV_ITEMS.filter((item) => allowedSet.has(item.slug))
    .map((item) => ({ ...item, codigo: codigoDaAba(item.slug) }))
    .sort((a, b) => compararCodigo(a.codigo ?? "", b.codigo ?? ""))

  // Telas de administração. Ficavam FIXAS no rodapé, que empurrava Configurações
  // e Sair para fora da tela em monitor baixo. Agora rolam junto com o resto.
  const itensAdmin = [
    isSuperAdmin && { href: "/admin", icon: ShieldAlert, titleKey: "platformAdmin" },
    ehAdmin && { href: "/settings/permissions", icon: Shield, titleKey: "permissions" },
    ehAdmin && { href: "/settings/fields", icon: ListPlus, titleKey: "customFields" },
    ehAdmin && temFiliais && { href: "/settings/filiais", icon: Building2, titleKey: "filiais" },
    ehAdmin && temApi && { href: "/settings/api", icon: Plug, titleKey: "apiKeys" },
    ehAdmin && { href: "/settings/vocabulary", icon: Languages, titleKey: "vocabulary" },
  ].filter(Boolean) as { href: string; icon: React.ElementType; titleKey: string }[]

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
      <SidebarHeader className="p-4 pb-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* A saída do menu, no celular.
                O painel esconde o "X" que o Sheet traz de fábrica
                (`[&>button]:hidden` em ui/sidebar.tsx), então até aqui a única
                forma de fechar era tocar fora da gaveta — que ninguém adivinha
                e que, num menu de vinte itens, quase sempre erra e abre a aba
                de baixo. A seta fica ANTES do nome, onde se procura voltar.
                Some no desktop, onde o menu não é gaveta e não se fecha. */}
            <button
              type="button"
              onClick={fecharNoMobile}
              aria-label={t("nav.fecharMenu")}
              title={t("nav.fecharMenu")}
              className="-ml-2 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <ArrowLeft className="size-6" />
            </button>
            <span className="font-bold text-lg">ServiçoOS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {t(`common.roles.${role}` as "common.roles.OWNER")}
            </Badge>
            {/* Fica no cabeçalho, e não na lista: ajuda não é uma tela entre
                outras, é o socorro que precisa estar à mão em qualquer uma. */}
            <Link
              href={ajudaDaqui}
              onClick={fecharNoMobile}
              aria-label={t("ajuda.abrir")}
              title={t("ajuda.abrir")}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CircleQuestionMark className="size-4" />
            </Link>
          </div>
        </div>
        {/* UMA barra de busca. A que existia aqui antes filtrava a lista só pelo
            nome, e convivia com esta logo abaixo — duas caixas de pesquisa
            lado a lado, com comportamentos diferentes. Esta atende os dois
            casos: aceita o número da aba e o nome, com ou sem acento. */}
        <BuscaAbas abasPermitidas={allowedTabs} ehAdmin={ehAdmin} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                    onClick={fecharNoMobile}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <Codigo valor={item.codigo} />
                    <span className="truncate">{t(`nav.${item.titleKey}` as "nav.dashboard")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {itensAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {itensAdmin.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={pathname === item.href}
                      onClick={fecharNoMobile}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <Codigo valor={codigoDaRota(item.href)} />
                      <span className="truncate">
                        {t(`nav.${item.titleKey}` as "nav.dashboard")}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {/* Tema é preferência do dispositivo (só de quem está usando),
                    então fica aqui. Idioma é decisão da empresa inteira e vive
                    em Configurações, com confirmação — um clique acidental aqui
                    já deixou a conta de uma cliente em inglês. (Ver 7.2.1.) */}
                <ThemeToggle />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Só estas duas ficam fixas: Configurações é para onde se volta quando
          algo precisa ser ajustado, e Sair não pode depender de rolar até o fim
          de uma lista de vinte itens. */}
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={pathname === "/settings"}
              onClick={fecharNoMobile}
            >
              <Settings className="size-4 shrink-0" />
              <Codigo valor={codigoDaRota("/settings")} />
              <span className="truncate">{t("nav.settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="size-4 shrink-0" />
              <span className="w-9 shrink-0" aria-hidden />
              <span className="truncate">{t("nav.signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
