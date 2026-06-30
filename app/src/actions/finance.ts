"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

const expenseSchema = z.object({
  description: z.string().min(2, "Descrição obrigatória"),
  amount: z.coerce.number().positive("Valor deve ser positivo"),
  dueDate: z.string().min(1, "Vencimento obrigatório"),
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
  const { tenantId } = await getTenant()

  const raw = Object.fromEntries(formData.entries())
  const parsed = expenseSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  await prisma.expense.create({
    data: {
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
      tenantId,
    },
  })

  revalidatePath("/finance")
  return { message: "Despesa criada." }
}

export async function markRevenuePaid(id: string) {
  const { tenantId } = await getTenant()
  await prisma.revenue.update({
    where: { id, tenantId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/finance")
}

export async function markExpensePaid(id: string) {
  const { tenantId } = await getTenant()
  await prisma.expense.update({
    where: { id, tenantId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/finance")
}

export async function getFinanceSummary(q?: string) {
  const { tenantId } = await getTenant()

  // Fetch all data for KPI calculations, then filter for table display
  const [allRevenues, allExpenses] = await Promise.all([
    prisma.revenue.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" } }),
    prisma.expense.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" } }),
  ])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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
