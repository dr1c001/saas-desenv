"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomUUID } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { retryOnUniqueConflict } from "@/lib/retry"
import { lerDinheiro } from "@/lib/dinheiro"
// Compartilhada com actions/os-orcamento.ts: um arquivo "use server" so pode
// exportar Server Action, entao a contagem mora num lib.
import { proximoNumeroDeOrcamento } from "@/lib/orcamento-db"

// As mensagens do zod são códigos estáveis, não frases prontas: quem monta o
// texto é o formulário, via next-intl, no idioma do usuário. O schema é módulo
// (sem acesso a hook/request), então traduzir aqui obrigaria a resolver locale
// dentro da action. (Mesmo padrão de actions/auth.ts — i18n, item 1.)
const quoteSchema = z.object({
  clientName: z.string().min(2, "clientNameRequired"),
  clientAddress: z.string().optional(),
  clientContact: z.string().optional(),
  description: z.string().min(3, "descriptionRequired"),
  materials: z.string().optional(),
  amount: z.string().optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]).default("DRAFT"),
})

export type QuoteFormState = {
  // Valores são chaves de quotes.validation.*, resolvidas no formulário.
  errors?: Record<string, string[]>
  messageCode?: "NO_PERMISSION"
}

// "1.234,56" (formato BR, o mesmo do placeholder "0,00" do campo) —
// replace(",", ".") sozinho vira "1.234.56", e parseFloat para no segundo
// ponto e devolve 1.234 em vez de 1234.56. Remove primeiro o separador de
// milhar, só depois troca a vírgula decimal pelo ponto.
// (Achado verificando o sistema antes da primeira venda, 2026-07-28.)
// A leitura virou lib/dinheiro.ts, compartilhada. Esta era a QUARTA cópia da
// mesma linha no projeto, e é assim que a quinta nasce errada — foi o que
// aconteceu no estoque e no patrimônio, onde a mesma regra lia "12.5" como 125.
// Aqui nunca deu problema porque o formulário já formatava com vírgula.
function parseBrCurrency(value: string): number {
  return lerDinheiro(value) ?? 0
}

export async function createQuote(
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const { tenantId, role, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { messageCode: "NO_PERMISSION" }
  const raw = Object.fromEntries(formData.entries())
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const { clientName, clientAddress, clientContact, description, materials, amount, notes, validUntil, status } = parsed.data

  // A contagem sem lock e o retry estão explicados em lib/orcamento-db.ts,
  // junto da função. (Achado em auditoria pré-venda, 2026-08-05.)
  await retryOnUniqueConflict(async () => {
    const number = await proximoNumeroDeOrcamento(tenantId)
    return prisma.quote.create({
      data: {
        number,
        tenantId,
        // Quem emitiu, para a assinatura CERTA sair no PDF. Sem isto só daria
        // para carimbar quem está BAIXANDO o documento — e um administrador
        // baixando o orçamento da Ana sairia com a assinatura dele.
        createdById: userId,
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
  if (role !== "OWNER" && role !== "ADMIN") return { messageCode: "NO_PERMISSION" }
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
