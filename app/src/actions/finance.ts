"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
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
  const [allRevenues, allExpenses] = await Promise.all([
    prisma.revenue.findMany({ where: { tenantId, ...filtro }, orderBy: { dueDate: "asc" } }),
    prisma.expense.findMany({ where: { tenantId, ...filtro }, orderBy: { dueDate: "asc" } }),
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

  return { revenues, expenses, monthlyRevenue, pendingRevenues, pendingExpenses }
}
