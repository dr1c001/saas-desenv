import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import React, { type ReactElement, type JSXElementConstructor } from "react"
import { prisma } from "./prisma"
import { PAST_DUE_GRACE_DAYS } from "./past-due"
import { ContratoPDF, VERSAO_CONTRATO, type DadosContrato } from "@/components/pdf/contrato-pdf"

// Monta o contrato de um cliente. Usado em dois lugares — o anexo do e-mail de
// confirmação de pagamento e o botão de baixar de novo na tela de assinatura —
// e por isso mora aqui, e não dentro de um deles.

/** Número legível e estável: mesma assinatura sempre gera o mesmo número. */
function numeroDoContrato(subscriptionId: string, criadaEm: Date): string {
  const ano = criadaEm.getFullYear()
  return `${ano}-${subscriptionId.slice(-8).toUpperCase()}`
}

export type ContratoGerado = { buffer: Buffer; nomeArquivo: string; numero: string }

export async function gerarContrato(tenantId: string): Promise<ContratoGerado | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      document: true,
      address: true,
      users: { where: { role: "OWNER" }, take: 1, select: { email: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          billingCycle: true,
          currentPeriodStart: true,
          plan: { select: { name: true, priceMonthly: true, priceYearly: true } },
        },
      },
    },
  })

  const assinatura = tenant?.subscriptions[0]
  // Sem assinatura não há o que contratar — devolve null em vez de gerar um
  // documento com campos vazios, que seria pior que documento nenhum.
  if (!tenant || !assinatura) return null

  const anual = assinatura.billingCycle === "YEARLY"
  const dados: DadosContrato = {
    numero: numeroDoContrato(assinatura.id, assinatura.createdAt),
    emitidoEm: new Date(),
    empresa: {
      nome: tenant.name,
      documento: tenant.document,
      email: tenant.users[0]?.email ?? "não informado",
      endereco: tenant.address,
    },
    plano: {
      nome: assinatura.plan.name,
      valorMensal: Number(assinatura.plan.priceMonthly),
      ciclo: anual ? "ANUAL" : "MENSAL",
      valorCobrado: anual ? Number(assinatura.plan.priceYearly) : Number(assinatura.plan.priceMonthly),
    },
    inicioVigencia: assinatura.currentPeriodStart,
    // Nunca escrever "5 dias" no contrato à mão: se a carência mudar em
    // lib/past-due.ts, o documento passaria a mentir.
    diasCarencia: PAST_DUE_GRACE_DAYS,
  }

  const buffer = await renderToBuffer(
    React.createElement(ContratoPDF, { dados }) as ReactElement<
      DocumentProps,
      string | JSXElementConstructor<unknown>
    >
  )

  return {
    buffer,
    numero: dados.numero,
    nomeArquivo: `contrato-servicoos-${dados.numero}-v${VERSAO_CONTRATO}.pdf`,
  }
}
