import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OverdueAlerts } from "@/components/layout/overdue-alerts"
import { AvisoDeTeste } from "@/components/layout/aviso-de-teste"
import { prisma } from "@/lib/prisma"
import { PushSubscriber } from "@/components/layout/push-subscriber"
import { LocationTracker } from "@/components/layout/location-tracker"
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker"
import { OfflineBanner } from "@/components/layout/offline-banner"
import { FilaOfflineBanner } from "@/components/layout/fila-offline-banner"
import { ImpersonationBanner } from "@/components/layout/impersonation-banner"
import { getTenant, getAllowedTabs, hasActiveSubscription } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/admin"
import { temFuncao, temRecurso } from "@/lib/plan"
import { redirect } from "next/navigation"
import { Assistente } from "@/components/ia/assistente"
import { headers } from "next/headers"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, role, userId } = await getTenant()

  // O teste grátis de 15 dias conta como acesso — ver testeAtivo em
  // lib/teste-gratis.ts, usado dentro de hasActiveSubscription para valer
  // também nas Server Actions, e não só nesta página.
  //
  // Acesso exige assinatura ACTIVE, teste dentro do prazo (ou PAST_DUE na carência
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

  // O estado da assinatura para o aviso de teste. Uma consulta a mais, mas
  // `hasActiveSubscription` é cacheada por requisição e não devolve a data.
  const empresa = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  })

  const allowedTabs = await getAllowedTabs(tenantId, role)
  const souDono = await isSuperAdmin()
  const [temApi, temFiliais, filaLigada] = await Promise.all([
    temRecurso(tenantId, "api"),
    temRecurso(tenantId, "filiais"),
    temFuncao(tenantId, "offline"),
  ])

  return (
    <SidebarProvider>
      <AppSidebar allowedTabs={allowedTabs} role={role} userId={userId} isSuperAdmin={souDono} temApi={temApi} temFiliais={temFiliais} />
      {/* `min-w-0` NÃO é enfeite: sem ele o menu some nas telas com tabela larga.
          Item de flex nasce com `min-width: auto`, e isso o impede de encolher
          abaixo da largura do próprio conteúdo. A tabela de 9 colunas do
          Histórico esticava este `main` para 1223px numa tela de 375px — medido
          no navegador —, e o `overflow-x-auto` da tabela nunca entrava em ação,
          porque o `w-full` dele já resolvia contra a largura esticada.
          Resultado: a página inteira ficava mais larga que o celular, e ao rolar
          para o lado para ler a tabela o cabeçalho ia junto, levando o botão do
          menu para fora da tela. Parecia "o menu travou em algumas abas".
          (Relatado no Histórico e nos Recibos, 01/09/2026.) */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-4 gap-2">
          <SidebarTrigger />
        </header>
        {/* Antes de tudo: se o dono da plataforma estiver vendo como um
            cliente, ele precisa saber disso o tempo todo. */}
        <ImpersonationBanner />
        <OfflineBanner />
        {/* O que o tecnico gravou sem sinal e ainda nao chegou ao servidor.
            Some sozinho quando a fila esvazia. */}
        <FilaOfflineBanner ligada={filaLigada} />
        {/* A contagem do teste grátis, ACIMA do resto: é a informação com
            prazo, e quem está testando precisa saber quanto falta antes de
            descobrir pela porta fechada. */}
        <Suspense>
          <AvisoDeTeste
            status={empresa?.subscriptionStatus ?? ""}
            trialEndsAt={empresa?.trialEndsAt ?? null}
          />
        </Suspense>
        <Suspense>
          <OverdueAlerts tenantId={tenantId} />
        </Suspense>
        <div className="flex-1 p-6">{children}</div>
      </main>
      {/* A assistente de voz. Ela mesma decide se aparece: sem o adicional
          contratado, não desenha nada. */}
      <Assistente />
      {/* Client-side services (service worker + push + GPS) */}
      <ServiceWorkerRegistrar />
      <PushSubscriber />
      <LocationTracker />
    </SidebarProvider>
  )
}
