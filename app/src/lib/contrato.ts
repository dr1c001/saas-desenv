import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import React, { type ReactElement, type JSXElementConstructor } from "react"
import { prisma } from "./prisma"
import { PAST_DUE_GRACE_DAYS } from "./past-due"
import { precoCheio } from "./preco"
import { ContratoPDF, versaoDoContrato, type DadosContrato } from "@/components/pdf/contrato-pdf"

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
      // O preço COMBINADO com esta empresa. Ver o quadro de preço abaixo.
      customPriceMonthly: true,
      users: { where: { role: "OWNER" }, take: 1, select: { email: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          billingCycle: true,
          currentPeriodStart: true,
          contractVersion: true,
          acceptedAt: true,
          acceptedIp: true,
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

  // ─── O preço que o contrato imprime é o que a empresa PAGA ────────────────
  //
  // Lia direto de `plan.priceMonthly/priceYearly` — a TABELA. Quem negociou
  // mensalidade (o painel grava `customPriceMonthly`) recebia, anexado ao
  // e-mail de confirmação, um contrato com o preço de tabela na Cláusula 2:
  // a Asaas cobrava R$ 120 e o documento da relação comercial dizia R$ 197.
  // No anual a divergência dobrava, porque `precoCheio` faz o combinado virar
  // doze vezes a mensalidade, e não o `priceYearly` da tabela.
  //
  // `precoCheio`, e não `precoCobrado`: o desconto de indicação vale só no
  // PRIMEIRO pagamento — o webhook devolve o preço cheio à assinatura da Asaas
  // assim que ele é confirmado. O contrato descreve o que se paga a cada
  // ciclo, e imprimir o valor de um mês só seria a outra metade do mesmo erro.
  // (Achado na auditoria de 13/09/2026.)
  const tabela = {
    priceMonthly: Number(assinatura.plan.priceMonthly),
    priceYearly: Number(assinatura.plan.priceYearly),
  }
  const combinado = tenant.customPriceMonthly === null ? null : Number(tenant.customPriceMonthly)
  const contrato = versaoDoContrato(assinatura.contractVersion, PAST_DUE_GRACE_DAYS)
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
      valorMensal: precoCheio(tabela, combinado, "MONTHLY"),
      ciclo: anual ? "ANUAL" : "MENSAL",
      valorCobrado: precoCheio(tabela, combinado, anual ? "YEARLY" : "MONTHLY"),
    },
    inicioVigencia: assinatura.currentPeriodStart,
    // Nunca escrever "5 dias" no contrato à mão: se a carência mudar em
    // lib/past-due.ts, o documento passaria a mentir. E para quem assinou uma
    // versão ANTERIOR, o prazo é o que aquela versão declarava — ver
    // versaoDoContrato.
    diasCarencia: contrato.diasCarencia,
    versao: contrato.versao,
    // Só o que foi REGISTRADO. Assinatura anterior a 22/09/2026 não tem
    // aceite gravado, e o documento não inventa um IP.
    aceite:
      assinatura.acceptedAt && assinatura.acceptedIp
        ? { em: assinatura.acceptedAt, ip: assinatura.acceptedIp }
        : null,
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
    nomeArquivo: `contrato-servicoos-${dados.numero}-v${contrato.versao}.pdf`,
  }
}
