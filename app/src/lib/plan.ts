import { cache } from "react"
import { prisma } from "./prisma"
import { getTranslations } from "next-intl/server"
import { RECURSOS, type Recurso } from "./recursos"

// Fonte única do que cada plano libera.
//
// Até 10/08/2026 isto NÃO EXISTIA: `hasActiveSubscription()` só verificava se
// a assinatura estava ACTIVE, nunca QUAL plano era. Na prática, quem pagava
// R$ 97 recebia exatamente o mesmo que quem pagava R$ 397 — a tela de preços
// prometia limites de usuário, cota de OS, Mapa GPS e NFS-e por plano, e nada
// disso era verificado em lugar nenhum do código.
//
// Os limites moram aqui, em código, e não em Plan.features do banco, porque
// aquele campo é texto de vitrine ("Até 3 usuários") — serve pra mostrar na
// tela, não pra decidir permissão. Chave é o Plan.slug.

// O catálogo (tipo + listas) vive em lib/recursos.ts, que é puro: componente
// de cliente pode importar de lá sem arrastar o Prisma junto. Aqui fica só o
// que precisa do banco. Reexportado pra não quebrar quem já importava daqui.
export type { Recurso } from "./recursos"
export { RECURSOS, RECURSOS_DE_ABA, ehRecurso } from "./recursos"

const TODOS: Recurso[] = [...RECURSOS]

/** O que um plano libera, sem ir ao banco. Usado pela tela do painel. */
export function recursosDoPlano(slug: string | null | undefined): Recurso[] {
  return [...((slug && POR_PLANO[slug]) || PERMISSIVO).recursos]
}

export type Limites = {
  maxUsuarios: number | null // null = ilimitado
  maxOsMes: number | null
  recursos: Recurso[]
}

// A API de integração é o ÚNICO recurso que o Pro não tem. É a linha que separa
// os dois planos pagos de cima: fora dela, Pro e Enterprise diferem só em
// quantidade (usuários ilimitados) e atendimento. Sem um recurso exclusivo, o
// Enterprise não tem o que oferecer a quem já cabe nos 10 usuários do Pro.
const SEM_API: Recurso[] = TODOS.filter((r) => r !== "api")

const POR_PLANO: Record<string, Limites> = {
  starter: { maxUsuarios: 3, maxOsMes: 50, recursos: [] },
  pro: { maxUsuarios: 10, maxOsMes: null, recursos: SEM_API },
  enterprise: { maxUsuarios: null, maxOsMes: null, recursos: TODOS },
}

// Slug desconhecido (plano novo cadastrado direto no banco) cai no permissivo
// de propósito. É uma troca deliberada: um plano novo mal cadastrado gera, no
// pior caso, recurso liberado a mais; o inverso — travar quem está pagando por
// causa de um slug que o código não conhece — é muito pior. Tenant sem plano
// nenhum também cai aqui, e não é brecha: sem assinatura ACTIVE o layout do
// dashboard já manda pra /expired antes de qualquer coisa.
const PERMISSIVO: Limites = { maxUsuarios: null, maxOsMes: null, recursos: TODOS }

// cache() do React: memoriza por requisição. Toda checagem de recurso
// (temRecurso/requireRecurso) e o getAllowedTabs do menu passam por aqui, e
// todos leem a MESMA linha de Tenant — sem isto, uma tela com três checagens
// fazia três idas ao banco pela mesma resposta. Seguro pelo mesmo motivo do
// hasActiveSubscription: nada troca o plano e relê no mesmo request.
export const getLimites = cache(async function getLimites(tenantId: string): Promise<Limites> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { extraFeatures: true, plan: { select: { slug: true } } },
  })

  const base = (tenant?.plan?.slug && POR_PLANO[tenant.plan.slug]) || PERMISSIVO

  // Recursos concedidos individualmente somam com os do plano (ver o comentário
  // de extraFeatures em schema.prisma).
  const extras = (tenant?.extraFeatures ?? []).filter((f): f is Recurso =>
    TODOS.includes(f as Recurso)
  )
  if (extras.length === 0) return base

  return { ...base, recursos: [...new Set([...base.recursos, ...extras])] }
})

export async function temRecurso(tenantId: string, recurso: Recurso): Promise<boolean> {
  return (await getLimites(tenantId)).recursos.includes(recurso)
}

/** Barra o recurso quando o plano não inclui. Use em toda Server Action e rota
 *  que entregue um recurso vendido por plano — bloqueio de tela não protege
 *  endpoint despachável direto. */
export async function requireRecurso(tenantId: string, recurso: Recurso): Promise<void> {
  if (await temRecurso(tenantId, recurso)) return
  const t = await getTranslations("errors")
  throw new Error(t(`planFeature.${recurso}` as "planFeature.gpsMap"))
}

/** Chamar ANTES de convidar alguém pra equipe. */
export async function requireVagaDeUsuario(tenantId: string): Promise<void> {
  const { maxUsuarios } = await getLimites(tenantId)
  if (maxUsuarios === null) return

  const atuais = await prisma.user.count({ where: { tenantId } })
  if (atuais < maxUsuarios) return

  const t = await getTranslations("errors")
  throw new Error(t("planLimit.users", { max: maxUsuarios }))
}

/** Chamar ANTES de criar uma OS. A cota é por mês corrente, contada pela data
 *  de criação — mesma janela que o cliente entende por "50 OS por mês". */
export async function requireCotaDeOs(tenantId: string): Promise<void> {
  const { maxOsMes } = await getLimites(tenantId)
  if (maxOsMes === null) return

  const agora = new Date()
  const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1))
  const doMes = await prisma.serviceOrder.count({
    where: { tenantId, createdAt: { gte: inicioDoMes } },
  })
  if (doMes < maxOsMes) return

  const t = await getTranslations("errors")
  throw new Error(t("planLimit.serviceOrders", { max: maxOsMes }))
}
