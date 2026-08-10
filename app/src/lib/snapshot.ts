import { prisma } from "./prisma"

/**
 * Quanto uma assinatura vale POR MÊS.
 *
 * O plano anual custa `priceYearly` pelo ano inteiro, então o valor mensal é
 * isso dividido por 12. O painel antigo tinha um ternário com os dois lados
 * iguais (`ciclo === "YEARLY" ? price : price`), o que inflava o MRR em 20%
 * assim que aparecesse o primeiro assinante anual. Mora aqui pra não voltar a
 * existir em duas versões.
 */
export function valorMensal(
  ciclo: string | null | undefined,
  plano: { priceMonthly: unknown; priceYearly: unknown } | null | undefined
): number {
  if (!plano) return 0
  return ciclo === "YEARLY" ? Number(plano.priceYearly) / 12 : Number(plano.priceMonthly)
}

/** Chave 'AAAA-MM' de uma data, no horário de Brasília. */
export function chaveMesBRT(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 3600_000)
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}`
}

export type Retrato = {
  companies: number
  activeCompanies: number
  pendingCompanies: number
  pastDueCompanies: number
  cancelledCompanies: number
  users: number
  payingUsers: number
  mrr: number
}

/** O retrato do negócio AGORA. Usado pelo cron (pra gravar o mês corrente) e
 *  pelo painel (pra mostrar o mês corrente sempre fresco, sem esperar o cron). */
export async function calcularRetratoAtual(): Promise<Retrato> {
  const [tenants, users] = await Promise.all([
    prisma.tenant.findMany({
      select: {
        id: true,
        subscriptionStatus: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { billingCycle: true } },
      },
    }),
    prisma.user.findMany({ select: { tenantId: true } }),
  ])

  const conta = (s: string) => tenants.filter((t) => t.subscriptionStatus === s).length
  const idsPagantes = new Set(
    tenants.filter((t) => t.subscriptionStatus === "ACTIVE").map((t) => t.id)
  )

  return {
    companies: tenants.length,
    activeCompanies: conta("ACTIVE"),
    pendingCompanies: conta("PENDING"),
    pastDueCompanies: conta("PAST_DUE"),
    cancelledCompanies: conta("CANCELLED"),
    users: users.length,
    payingUsers: users.filter((u) => idsPagantes.has(u.tenantId)).length,
    mrr: tenants
      .filter((t) => t.subscriptionStatus === "ACTIVE")
      .reduce((soma, t) => soma + valorMensal(t.subscriptions[0]?.billingCycle, t.plan), 0),
  }
}

/**
 * Grava (ou atualiza) o retrato do mês corrente.
 *
 * Roda todo dia, sempre sobre a MESMA linha do mês. O efeito é que meses
 * passados congelam com o último valor que tiveram naquele mês, e o mês atual
 * fica sempre fresco — sem precisar de nenhum job de virada de mês, que seria
 * mais uma coisa pra falhar em silêncio.
 */
export async function gravarRetratoDoMes(quando = new Date()): Promise<string> {
  const month = chaveMesBRT(quando)
  const retrato = await calcularRetratoAtual()
  await prisma.monthlySnapshot.upsert({
    where: { month },
    create: { month, ...retrato },
    update: retrato,
  })
  return month
}
