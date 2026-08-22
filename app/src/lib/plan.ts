import { cache } from "react"
import { prisma } from "./prisma"
import { getTranslations } from "next-intl/server"
import { RECURSOS, type Recurso } from "./recursos"
import { brtMidnightUTC, todayInBRT } from "./utils"
import { limiteEfetivo } from "./limite"
import { funcaoLigada, type Funcao } from "./funcoes"

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
export { FUNCOES, FUNCOES_COM_CUSTO, ehFuncao } from "./funcoes"
export type { Funcao } from "./funcoes"

const TODOS: Recurso[] = [...RECURSOS]

/** O que um plano libera, sem ir ao banco. Usado pela tela do painel. */
export function recursosDoPlano(slug: string | null | undefined): Recurso[] {
  return [...((slug && POR_PLANO[slug]) || PERMISSIVO).recursos]
}

/** Os TETOS do plano, sem ir ao banco. A tela do painel mostra estes ao lado do
 *  ajuste da empresa, para "herdar" não ser uma escolha às cegas. */
export function limitesDoPlano(slug: string | null | undefined): {
  usuarios: number | null
  osMes: number | null
  nfseMes: number | null
} {
  const p = (slug && POR_PLANO[slug]) || PERMISSIVO
  return { usuarios: p.maxUsuarios, osMes: p.maxOsMes, nfseMes: p.maxNfseMes }
}

export type Limites = {
  maxUsuarios: number | null // null = ilimitado
  maxOsMes: number | null
  /** Notas fiscais por mês. Vendida como número na tela de planos ("8 notas
   *  fiscais por mês"), e até 21/08/2026 NADA no sistema contava nota emitida —
   *  a promessa existia só na vitrine. */
  maxNfseMes: number | null
  recursos: Recurso[]
}

// O que separa os dois planos pagos de cima. Fora destes, Pro e Enterprise
// diferem só em quantidade (usuários ilimitados) e atendimento — e sem nenhum
// recurso exclusivo, o Enterprise não tem o que oferecer a quem já cabe nos 10
// usuários do Pro.
//
// Os dois são de empresa que cresceu: quem integra com ERP e quem tem mais de
// uma unidade. É a mesma pessoa.
const SO_ENTERPRISE: Recurso[] = ["api", "filiais"]

const SEM_EXCLUSIVOS: Recurso[] = TODOS.filter((r) => !SO_ENTERPRISE.includes(r))

const POR_PLANO: Record<string, Limites> = {
  starter: { maxUsuarios: 3, maxOsMes: 50, maxNfseMes: 8, recursos: [] },
  pro: { maxUsuarios: 10, maxOsMes: 200, maxNfseMes: 70, recursos: SEM_EXCLUSIVOS },
  enterprise: { maxUsuarios: null, maxOsMes: null, maxNfseMes: null, recursos: TODOS },
}

// Slug desconhecido (plano novo cadastrado direto no banco) cai no permissivo
// de propósito. É uma troca deliberada: um plano novo mal cadastrado gera, no
// pior caso, recurso liberado a mais; o inverso — travar quem está pagando por
// causa de um slug que o código não conhece — é muito pior. Tenant sem plano
// nenhum também cai aqui, e não é brecha: sem assinatura ACTIVE o layout do
// dashboard já manda pra /expired antes de qualquer coisa.
const PERMISSIVO: Limites = { maxUsuarios: null, maxOsMes: null, maxNfseMes: null, recursos: TODOS }

// cache() do React: memoriza por requisição. Toda checagem de recurso
// (temRecurso/requireRecurso) e o getAllowedTabs do menu passam por aqui, e
// todos leem a MESMA linha de Tenant — sem isto, uma tela com três checagens
// fazia três idas ao banco pela mesma resposta. Seguro pelo mesmo motivo do
// hasActiveSubscription: nada troca o plano e relê no mesmo request.
export const getLimites = cache(async function getLimites(tenantId: string): Promise<Limites> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      extraFeatures: true,
      maxUsersOverride: true,
      maxOrdersOverride: true,
      maxNfseOverride: true,
      plan: { select: { slug: true } },
    },
  })

  const doPlano = (tenant?.plan?.slug && POR_PLANO[tenant.plan.slug]) || PERMISSIVO

  // Recursos concedidos individualmente somam com os do plano (ver o comentário
  // de extraFeatures em schema.prisma).
  const extras = (tenant?.extraFeatures ?? []).filter((f): f is Recurso =>
    TODOS.includes(f as Recurso)
  )

  // E os TETOS ajustados para esta empresa por cima do plano. `null` herda,
  // `0` é sem limite — a diferença entre os dois está em lib/limite.ts, que é
  // onde ela é testada.
  return {
    maxUsuarios: limiteEfetivo(doPlano.maxUsuarios, tenant?.maxUsersOverride ?? null),
    maxOsMes: limiteEfetivo(doPlano.maxOsMes, tenant?.maxOrdersOverride ?? null),
    maxNfseMes: limiteEfetivo(doPlano.maxNfseMes, tenant?.maxNfseOverride ?? null),
    recursos:
      extras.length === 0 ? doPlano.recursos : [...new Set([...doPlano.recursos, ...extras])],
  }
})

/**
 * Esta função está ligada para esta empresa?
 *
 * O padrão é SIM — o oposto de `temRecurso`, e de propósito. Recurso é o que o
 * plano VENDE (nasce desligado); função é o que o sistema FAZ (nasce ligada, e
 * o painel desliga). Ver lib/funcoes.ts.
 *
 * Mesmo cache por requisição do getLimites: uma tela que checa três funções
 * não pode virar três idas ao banco.
 */
export const temFuncao = cache(async function temFuncao(
  tenantId: string,
  funcao: Funcao
): Promise<boolean> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { disabledFeatures: true },
  })
  return funcaoLigada(funcao, t?.disabledFeatures ?? [])
})

/** Barra quando a função foi desligada para esta empresa. Use em toda Action e
 *  rota que entregue a função — esconder botão não protege endereço HTTP. */
export async function requireFuncao(tenantId: string, funcao: Funcao): Promise<void> {
  if (await temFuncao(tenantId, funcao)) return
  const t = await getTranslations("errors")
  throw new Error(t("funcaoDesligada"))
}

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

/**
 * Quando começa o mês da cota.
 *
 * Meia-noite em BRASÍLIA, e não em UTC. O resto do sistema já conta mês em BRT
 * (dashboard, financeiro, relatórios) e a cota fazia a conta em UTC — uma OS
 * aberta às 21h30 do dia 31 caía no mês seguinte para a cota e no mês corrente
 * para o faturamento. A empresa é brasileira e o mês dela é o do calendário
 * dela.
 *
 * Num lugar só porque agora há DUAS cotas mensais (OS e NFS-e), e a rota da
 * API repetia a conta uma terceira vez.
 */
export function inicioDoMesDaCota(): Date {
  const { year, month } = todayInBRT()
  return brtMidnightUTC(year, month, 1)
}

/** Chamar ANTES de criar uma OS. A cota é do mês corrente, contada pela data
 *  de criação — mesma janela que o cliente entende por "50 OS por mês". */
export async function requireCotaDeOs(tenantId: string): Promise<void> {
  const { maxOsMes } = await getLimites(tenantId)
  if (maxOsMes === null) return

  const doMes = await prisma.serviceOrder.count({
    where: { tenantId, createdAt: { gte: inicioDoMesDaCota() } },
  })
  if (doMes < maxOsMes) return

  const t = await getTranslations("errors")
  throw new Error(t("planLimit.serviceOrders", { max: maxOsMes }))
}

/**
 * A cota de notas fiscais do mês.
 *
 * Conta por `nfseIssuedAt`, e não pelo `createdAt` da OS: uma OS aberta em
 * julho e faturada em agosto gasta a cota de AGOSTO, que é o mês em que a nota
 * saiu. Contar pela criação da OS deixaria a cota do mês passado ser gasta
 * neste.
 */
export async function requireCotaDeNfse(tenantId: string): Promise<void> {
  const { maxNfseMes } = await getLimites(tenantId)
  if (maxNfseMes === null) return

  const doMes = await prisma.serviceOrder.count({
    where: { tenantId, nfseIssuedAt: { gte: inicioDoMesDaCota() } },
  })
  if (doMes < maxNfseMes) return

  const t = await getTranslations("errors")
  throw new Error(t("planLimit.nfse", { max: maxNfseMes }))
}
