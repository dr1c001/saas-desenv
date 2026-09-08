"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { nanoid } from "nanoid"

export async function getReferralInfo() {
  const { tenantId, role } = await getTenant()
  // Indicação é assunto comercial da empresa (código próprio + saldo de
  // desconto na fatura) e esta função também ESCREVE, gerando o código na
  // primeira leitura. Técnico não tem o que fazer aqui — mesma régua já
  // aplicada a /billing e /finance. (Auditoria rodada 4, 08/08/2026.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("Sem permissão.")
  await requireActiveSubscription(tenantId)

  let tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { referralCode: true, referralDiscountPercent: true },
  })

  // Auto-generate referral code if not set
  if (!tenant?.referralCode) {
    const code = nanoid(8).toUpperCase()
    tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { referralCode: code },
      select: { referralCode: true, referralDiscountPercent: true },
    })
  }

  // Count how many tenants were referred by this code
  const referralCount = await prisma.tenant.count({
    where: { referredByCode: tenant!.referralCode! },
  })

  // Count those who are now ACTIVE (converted to paid)
  const converted = await prisma.tenant.count({
    where: { referredByCode: tenant!.referralCode!, subscriptionStatus: "ACTIVE" },
  })

  return {
    code: tenant!.referralCode!,
    referralCount,
    converted,
    // Saldo de desconto pendente — creditado pelo webhook do Asaas na primeira
    // conversão de cada indicado, consumido no próximo subscribeToPlan.
    discountPercent: tenant!.referralDiscountPercent,
  }
}
