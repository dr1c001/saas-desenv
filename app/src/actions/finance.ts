"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { agruparComissoes, baseDaComissaoValida } from "@/lib/comissao"
import { reconciliarComissao } from "@/lib/comissao-db"
import { filtroDeFilialAtual, getTenant, requireActiveSubscription } from "@/lib/auth"
import { filialParaNovo } from "@/lib/filial"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"

const expenseSchema = z.object({
  description: z.string().min(2, "descriptionRequired"),
  amount: z.coerce.number().positive("amountPositive"),
  dueDate: z.string().min(1, "dueDateRequired"),
  category: z.enum(["FIXED", "VARIABLE", "OTHER"]).default("OTHER"),
  recurring: z.coerce.boolean().default(false),
})

export type FinanceFormState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function createExpense(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  const { tenantId, role, branchId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { message: (await getTranslations("common"))("noPermission") }

  const raw = Object.fromEntries(formData.entries())
  const parsed = expenseSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }

  await prisma.expense.create({
    data: {
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
      tenantId,
      branchId: filialParaNovo(null, branchId),
    },
  })

  revalidatePath("/finance")
  return { message: "Despesa criada." }
}

export async function markRevenuePaid(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  await prisma.revenue.update({
    where: { id, tenantId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/finance")
}

export async function markExpensePaid(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  await prisma.expense.update({
    where: { id, tenantId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/finance")
}

export async function getFinanceSummary(q?: string, filial?: string | null) {
  const { tenantId, role } = await getTenant()
  // Auto-defesa: essa função já tem um Action ID registrado e despachável
  // pelo Next.js independente de quem a importa hoje — não dá pra confiar
  // só na página chamadora redirecionar antes. Mesmo padrão do getSettings().
  // (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  // Fetch all data for KPI calculations, then filter for table display
  // O financeiro é escopado: cada unidade fecha o mês dela. O que não tem
  // filial entra em todas — é despesa da empresa, não de uma unidade.
  const filtro = await filtroDeFilialAtual(filial)
  const [allRevenues, allExpenses, empresa] = await Promise.all([
    prisma.revenue.findMany({ where: { tenantId, ...filtro }, orderBy: { dueDate: "asc" } }),
    prisma.expense.findMany({
      where: { tenantId, ...filtro },
      // O nome de quem recebe a comissao. Sem ele o bloco de comissoes
      // mostraria um id, e o dono precisa ler "Ana Souza".
      include: { payee: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    // Sobre o que a comissao incide. O cartao mostra e deixa trocar.
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { commissionBase: true, commissionBulkPay: true },
    }),
  ])

  // Início do mês em horário de Brasília, não UTC do servidor — ver
  // brtMidnightUTC em lib/utils.ts. (Achado verificando o sistema antes da
  // primeira venda, 2026-08-03.)
  const { year, month } = todayInBRT()
  const startOfMonth = brtMidnightUTC(year, month, 1)

  // KPIs always computed from full dataset regardless of search
  const monthlyRevenue = allRevenues
    .filter((r) => r.status === "PAID" && r.paidAt && r.paidAt >= startOfMonth)
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const pendingRevenues = allRevenues.filter((r) => r.status === "PENDING")
  const pendingExpenses = allExpenses.filter((e) => e.status === "PENDING")

  // Table display filtered by search
  const ql = q?.toLowerCase()
  const revenues = ql
    ? allRevenues.filter((r) => r.description.toLowerCase().includes(ql))
    : allRevenues
  const expenses = ql
    ? allExpenses.filter((e) => e.description.toLowerCase().includes(ql))
    : allExpenses

  // As comissoes a pagar, agrupadas por pessoa.
  //
  // Agrupadas, e nao soltas na tabela: quatro tecnicos com vinte OS no mes sao
  // oitenta linhas novas numa tabela de quatro colunas sem paginacao. O dono
  // abriria o Financeiro e nao acharia mais o aluguel.
  //
  // Calculadas sobre TODAS as pendentes, e nao sobre as filtradas pela busca:
  // e o mesmo criterio dos outros indicadores desta tela.
  const comissoes = agruparComissoes(
    pendingExpenses
      .filter((e) => e.orderId !== null && e.payeeId !== null)
      .map((e) => ({
        payeeId: e.payeeId!,
        nome: e.payee?.name ?? "",
        valor: Number(e.amount),
        base: Number(e.commissionBase ?? 0),
        iss: Number(e.commissionIss ?? 0),
      }))
  )

  return {
    revenues,
    expenses,
    monthlyRevenue,
    pendingRevenues,
    pendingExpenses,
    comissoes,
    baseDaComissao: empresa?.commissionBase ?? "TOTAL",
    pagamentoEmLote: empresa?.commissionBulkPay ?? true,
  }
}

/**
 * Sobre o que a comissão do técnico incide: o total da OS ou só a mão de obra.
 *
 * ─── Por que recalcula as pendentes ──────────────────────────────────────────
 *
 * Trocar a configuração e deixar as comissões já lançadas com a base antiga
 * faria a tela responder duas regras ao mesmo tempo: o dono mudaria para "só
 * mão de obra", olharia a lista e continuaria vendo os R$ 120 da Ana calculados
 * sobre o total, sem nada explicando por quê.
 *
 * O filtro por PENDING aqui é economia de trabalho, e NÃO é o que protege a
 * comissão já paga — quem protege é o próprio reconciliador, que congela
 * qualquer despesa PAGA antes de tocar nela. Um teste de mutação confirmou:
 * tirar este filtro não muda resultado nenhum, só faz o laço percorrer linhas
 * que não vão mudar.
 */
export async function definirBaseDaComissao(base: string): Promise<{ erro?: string; ok?: boolean }> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Muda quanto a empresa paga a cada pessoa. Não é decisão de quem recebe.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }
  if (!baseDaComissaoValida(base)) return { erro: "baseInvalida" }

  await prisma.tenant.update({ where: { id: tenantId }, data: { commissionBase: base } })

  // As comissões ainda não pagas passam a valer pela regra nova.
  const pendentes = await prisma.expense.findMany({
    where: { tenantId, status: "PENDING", orderId: { not: null } },
    select: { orderId: true },
  })
  for (const p of pendentes) {
    await reconciliarComissao(prisma, tenantId, p.orderId!)
  }

  revalidatePath("/finance")
  return { ok: true }
}

/**
 * Paga TODAS as comissões pendentes de uma pessoa, de uma vez.
 *
 * ─── Por que existe ──────────────────────────────────────────────────────────
 *
 * `markExpensePaid` paga uma despesa por chamada, e o botão é por linha. Quatro
 * técnicos com vinte OS são oitenta cliques no fechamento. No primeiro mês o
 * dono faz; no segundo ele volta para o caderno — e o recurso morre
 * funcionando.
 *
 * ─── Por que é opção da empresa ──────────────────────────────────────────────
 *
 * Um clique passa a mover muito dinheiro de uma vez. Quem prefere conferir OS a
 * OS tem motivo, e desliga.
 *
 * ─── Por que numa transação só ───────────────────────────────────────────────
 *
 * Vinte `update` soltos podem falhar no décimo, e aí metade das comissões da
 * Ana ficaria paga e metade não — sem nada na tela dizendo onde parou. Ou todas
 * ou nenhuma.
 */
export async function pagarComissoesDe(
  payeeId: string
): Promise<{ erro?: string; ok?: boolean; pagas?: number; total?: number }> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Pagar move dinheiro. Não é gesto de quem recebe.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const empresa = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { commissionBulkPay: true },
  })
  // A trava mora AQUI, e não só no botão: a Action é endereço HTTP, e esconder
  // o botão não impede ninguém de chamá-la.
  if (!empresa?.commissionBulkPay) return { erro: "loteDesligado" }

  // `payeeId` é conferido contra o tenant junto com o resto do filtro: um id de
  // fora simplesmente não casa com despesa nenhuma desta empresa.
  const pendentes = await prisma.expense.findMany({
    where: { tenantId, payeeId, status: "PENDING", orderId: { not: null } },
    select: { id: true, amount: true },
  })
  if (pendentes.length === 0) return { erro: "nadaAPagar" }

  const agora = new Date()
  await prisma.$transaction(
    pendentes.map((e) =>
      prisma.expense.update({
        where: { id: e.id },
        // O `where` do updateMany não caberia: cada linha precisa do mesmo
        // paidAt, e o status muda de PENDING para PAID apenas nas que ainda
        // estavam pendentes quando a lista foi lida.
        data: { status: "PAID", paidAt: agora },
      })
    )
  )

  const total = pendentes.reduce((s, e) => s + Number(e.amount), 0)

  revalidatePath("/finance")
  return { ok: true, pagas: pendentes.length, total: Math.round(total * 100) / 100 }
}

/** Liga e desliga o pagamento em lote das comissões. */
export async function definirPagamentoEmLote(
  ligado: boolean
): Promise<{ erro?: string; ok?: boolean }> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  await prisma.tenant.update({ where: { id: tenantId }, data: { commissionBulkPay: ligado } })
  revalidatePath("/finance")
  return { ok: true }
}
