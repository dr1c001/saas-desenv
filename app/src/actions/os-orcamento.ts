"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { retryOnUniqueConflict } from "@/lib/retry"
import { proximoNumeroDeOrcamento } from "@/lib/orcamento-db"
import { lerTaxaDeVisita, podeGerarOrcamento } from "@/lib/os-orcamento"

// "O técnico foi até lá e o cliente só quer orçamento."
//
// A ação que fecha o buraco entre a visita e a proposta. Sem ela, o
// deslocamento virava uma OS que ninguém sabia o que fazer — e o orçamento era
// redigitado do zero, com cliente e endereço copiados à mão de uma tela para a
// outra, que é onde nascem os erros de endereço.

export type EstadoGerar = { erro?: string }

/**
 * Cria um orçamento a partir de uma OS, já vinculado a ela.
 *
 * ─── O que vem junto, e por quê ────────────────────────────────────────────
 *
 * Cliente e contato saem da OS: são os dados que o técnico confirmou no local.
 *
 * **As FOTOS também.** O técnico acabou de fotografar o cano estourado, e é
 * essa foto que responde "por que custa isso" para quem vai decidir. Copia-se
 * o vínculo, não o arquivo: ele continua um só no armazenamento.
 */
export async function gerarOrcamentoDaOs(orderId: string): Promise<EstadoGerar> {
  const { tenantId, role, userId } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Orçamento é proposta comercial: quem assina preço é dono ou administrador.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const os = await prisma.serviceOrder.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      client: {
        select: {
          // O id, para o orcamento nascer ligado ao cliente CADASTRADO. Este
          // caminho sempre teve um Client de verdade na mao e nunca o gravou.
          id: true,
          name: true,
          phone: true,
          whatsapp: true,
          email: true,
          address: {
            select: { street: true, number: true, district: true, city: true, state: true },
          },
        },
      },
      attachments: { select: { url: true, name: true } },
    },
  })
  if (!os) return { erro: "naoEncontrada" }
  if (!podeGerarOrcamento(os.status)) return { erro: "statusNaoPermite" }

  // Uma visita gera UM orçamento. O segundo seria o mesmo pedido contado duas
  // vezes no funil, e a tela de fechamento não saberia qual dos dois olhar.
  const jaTem = await prisma.quote.findFirst({
    where: { orderId, tenantId },
    select: { id: true },
  })
  if (jaTem) return { erro: "jaTemOrcamento" }

  const e = os.client.address
  const endereco = e
    ? [e.street, e.number, e.district, e.city, e.state].filter(Boolean).join(", ")
    : null
  const contato = os.client.whatsapp || os.client.phone || os.client.email || null

  const criado = await retryOnUniqueConflict(async () => {
    const number = await proximoNumeroDeOrcamento(tenantId)
    return prisma.quote.create({
      data: {
        number,
        tenantId,
        orderId,
        createdById: userId,
        clientId: os.client.id,
        clientName: os.client.name,
        clientAddress: endereco,
        clientContact: contato,
        // O título é o que o cliente pediu; a descrição é o que o técnico viu.
        // Os dois juntos são o começo da proposta — e nascem como RASCUNHO,
        // para ele revisar o preço antes de mandar.
        description: os.description ? `${os.title}\n\n${os.description}` : os.title,
        amount: 0,
        status: "DRAFT",
        // O @default(uuid()) do schema não chegou à coluna do banco (drift
        // confirmado). Sem gerar aqui, o link público /q/[token] não funciona.
        clientToken: randomUUID(),
      },
      select: { id: true },
    })
  })

  // As fotos da visita passam a aparecer também no orçamento.
  if (os.attachments.length > 0) {
    await prisma.attachment.createMany({
      data: os.attachments.map((a) => ({
        quoteId: criado.id,
        url: a.url,
        name: a.name,
      })),
    })
  }

  revalidatePath(`/service-orders/${orderId}`)
  revalidatePath("/quotes")
  redirect(`/quotes/${criado.id}`)
}

/** A taxa de visita da empresa, para a tela de configurações. */
export async function getTaxaDeVisita(): Promise<number> {
  const { tenantId } = await getTenant()
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { visitFee: true },
  })
  return t?.visitFee ? Number(t.visitFee) : 0
}

export type EstadoTaxa = { erro?: string; ok?: boolean }

export async function salvarTaxaDeVisita(
  _prev: EstadoTaxa,
  formData: FormData
): Promise<EstadoTaxa> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  // A higiene do valor (vazio, letra e negativo viram zero) mora em
  // lib/os-orcamento.ts. Repeti-la aqui criaria dois lugares para divergir.
  const valor = lerTaxaDeVisita(String(formData.get("visitFee") ?? "").replace(",", "."))

  await prisma.tenant.update({
    where: { id: tenantId },
    // Zero grava NULL: "não cobra" e "cobra R$ 0,00" são a mesma coisa, e um
    // valor só evita a tela ter de explicar a diferença.
    data: { visitFee: valor > 0 ? valor : null },
  })

  revalidatePath("/settings")
  return { ok: true }
}
