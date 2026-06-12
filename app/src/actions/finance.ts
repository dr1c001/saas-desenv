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

export async function getFinanceSummary() {
  const { tenantId } = await getTenant()

  const [revenues, expenses] = await Promise.all([
    prisma.revenue.findMany({
      where: { tenantId },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.findMany({
      where: { tenantId },
      orderBy: { dueDate: "asc" },
    }),
  ])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const monthlyRevenue = revenues
    .filter((r: (typeof revenues)[0]) => r.status === "PAID" && r.paidAt && r.paidAt >= startOfMonth)
    .reduce((sum: number, r: (typeof revenues)[0]) => sum + Number(r.amount), 0)

  const pendingRevenues = revenues.filter((r: (typeof revenues)[0]) => r.status === "PENDING")
  const pendingExpenses = expenses.filter((e: (typeof expenses)[0]) => e.status === "PENDING")

  return { revenues, expenses, monthlyRevenue, pendingRevenues, pendingExpenses }
}
