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
import { abaDaRota } from "@/lib/codigos-abas"
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

  // A aba não esconde só o menu: ela BARRA A ROTA.
  //
  // Até aqui `getAllowedTabs` tinha um consumidor — a linha acima — e o
  // resultado só virava prop da barra lateral. Desmarcar "Clientes" para o
  // técnico tirava o item do menu e mais nada: ele digitava /clients e recebia
  // a carteira inteira, com documento, telefone e endereço de cada um. Com oito
  // cargos configuráveis, a aba é o único separador entre a maioria deles.
  //
  // A trava mora aqui, ao lado da trava de assinatura, e pelo mesmo motivo: é o
  // único ponto por onde toda tela do painel passa. Espalhar a checagem por
  // página deixaria a próxima página nova de fora — que é como este defeito
  // nasceu.
  //
  // `abaDaRota` devolve null para rota não catalogada, e null LIBERA. Ver o
  // porquê em lib/codigos-abas.ts. (Achado na auditoria de 13/09/2026.)
  const abaDaTela = abaDaRota(pathname)
  if (abaDaTela && !allowedTabs.includes(abaDaTela)) redirect("/dashboard")
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
        {/* GRUDADO no topo. Este cabeçalho carrega o único botão de menu que
            existe no celular; sem `sticky`, quem rolava uma lista de OS até o
            fim precisava rolar tudo de volta para cima só para trocar de tela.
            Precisa de fundo próprio: sem ele o conteúdo passa por baixo e se
            lê o texto da lista atravessando o botão. */}
        <header className="sticky top-0 z-20 h-14 border-b bg-background flex items-center px-4 gap-2">
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
        {/* 16px no celular, 24 no desktop. `p-6` fixo comia 48 dos 375px de um
            telefone comum — 13% da tela em margem, numa tela onde o que falta
            é largura. */}
        <div className="flex-1 p-4 md:p-6">{children}</div>
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
