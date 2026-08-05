"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomUUID } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { retryOnUniqueConflict } from "@/lib/retry"

const quoteSchema = z.object({
  clientName: z.string().min(2, "Nome do cliente obrigatório"),
  clientAddress: z.string().optional(),
  clientContact: z.string().optional(),
  description: z.string().min(3, "Descrição do serviço obrigatória"),
  materials: z.string().optional(),
  amount: z.string().optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]).default("DRAFT"),
})

export type QuoteFormState = {
  errors?: Record<string, string[]>
  message?: string
}

// "1.234,56" (formato BR, o mesmo do placeholder "0,00" do campo) —
// replace(",", ".") sozinho vira "1.234.56", e parseFloat para no segundo
// ponto e devolve 1.234 em vez de 1234.56. Remove primeiro o separador de
// milhar, só depois troca a vírgula decimal pelo ponto.
// (Achado verificando o sistema antes da primeira venda, 2026-07-28.)
function parseBrCurrency(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", "."))
}

async function nextQuoteNumber(tenantId: string) {
  const last = await prisma.quote.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}

export async function createQuote(
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { message: "Sem permissão." }
  const raw = Object.fromEntries(formData.entries())
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { clientName, clientAddress, clientContact, description, materials, amount, notes, validUntil, status } = parsed.data

  // nextQuoteNumber lê "o último número" sem lock — duas criações
  // simultâneas podem calcular o mesmo número. number tem
  // @@unique([tenantId, number]), então a segunda só falha (P2002) em vez de
  // duplicar; retryOnUniqueConflict tenta de novo com o número atualizado.
  // (Achado em auditoria pré-venda, 2026-08-05.)
  await retryOnUniqueConflict(async () => {
    const number = await nextQuoteNumber(tenantId)
    return prisma.quote.create({
      data: {
        number,
        tenantId,
        clientName,
        clientAddress: clientAddress || null,
        clientContact: clientContact || null,
        description,
        materials: materials || null,
        amount: amount ? parseBrCurrency(amount) : 0,
        notes: notes || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status,
        // @default(uuid()) do schema não está de fato aplicado na coluna do
        // banco (drift confirmado via information_schema — column_default
        // nulo) — sem gerar aqui, clientToken ficava sempre nulo, quebrando a
        // aprovação online do orçamento pelo cliente (depende desse token no
        // link público /q/[token]). (Achado verificando o sistema de NPS,
        // 2026-07-22.)
        clientToken: randomUUID(),
      },
    })
  })

  revalidatePath("/quotes")
  redirect("/quotes")
}

export async function updateQuote(
  id: string,
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { message: "Sem permissão." }
  const raw = Object.fromEntries(formData.entries())
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { clientName, clientAddress, clientContact, description, materials, amount, notes, validUntil, status } = parsed.data

  await prisma.quote.update({
    where: { id, tenantId },
    data: {
      clientName,
      clientAddress: clientAddress || null,
      clientContact: clientContact || null,
      description,
      materials: materials || null,
      amount: amount ? parseBrCurrency(amount) : 0,
      notes: notes || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      status,
    },
  })

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  redirect(`/quotes/${id}`)
}

export async function updateQuoteStatus(id: string, status: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  const valid = ["DRAFT", "SENT", "APPROVED", "REJECTED"]
  if (!valid.includes(status)) return
  await prisma.quote.update({ where: { id, tenantId }, data: { status: status as never } })
  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
}

export async function deleteQuote(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  await prisma.quote.delete({ where: { id, tenantId } })
  revalidatePath("/quotes")
  redirect("/quotes")
}

export async function getQuotes(filters?: { q?: string; status?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.quote.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.q
        ? {
            OR: [
              { clientName: { contains: filters.q, mode: "insensitive" } },
              { description: { contains: filters.q, mode: "insensitive" } },
              { clientContact: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getQuote(id: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.quote.findUnique({ where: { id, tenantId } })
}
