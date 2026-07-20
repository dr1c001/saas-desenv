"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

// Exportação self-service de dados (LGPD art. 18 — portabilidade). Reúne
// tudo que a Política de Privacidade (seção 2) declara coletar, exceto
// segredos/credenciais internas (zapiToken, ids de integração) que não são
// "dados pessoais" no sentido da lei e nunca deveriam sair do sistema.
// Restrito a OWNER — mesmo nível de acesso já usado para config fiscal,
// dado que isso inclui dados financeiros e PII de toda a equipe/clientes.
export async function exportTenantData() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER") throw new Error("Sem permissão.")

  const [
    tenant,
    users,
    clients,
    serviceOrders,
    quotes,
    equipment,
    providers,
    maintenanceOrders,
    revenues,
    expenses,
    subscriptions,
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        document: true,
        phone: true,
        website: true,
        address: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        fiscalCnpj: true,
        fiscalCityName: true,
        fiscalStateCode: true,
        fiscalIssRate: true,
      },
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        document: true,
        phone: true,
        createdAt: true,
        userAddress: true,
      },
    }),
    prisma.client.findMany({ where: { tenantId }, include: { address: true } }),
    prisma.serviceOrder.findMany({
      where: { tenantId },
      include: { items: true, checklist: true, attachments: true },
    }),
    prisma.quote.findMany({ where: { tenantId } }),
    prisma.equipment.findMany({ where: { tenantId } }),
    prisma.provider.findMany({ where: { tenantId } }),
    prisma.maintenanceOrder.findMany({ where: { tenantId }, include: { items: true } }),
    prisma.revenue.findMany({ where: { tenantId } }),
    prisma.expense.findMany({ where: { tenantId } }),
    prisma.subscription.findMany({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        billingCycle: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelledAt: true,
        createdAt: true,
        plan: { select: { name: true } },
      },
    }),
  ])

  return {
    exportadoEm: new Date().toISOString(),
    empresa: tenant,
    usuarios: users,
    clientes: clients,
    ordensDeServico: serviceOrders,
    orcamentos: quotes,
    equipamentos: equipment,
    prestadores: providers,
    ordensDeManutencao: maintenanceOrders,
    receitas: revenues,
    despesas: expenses,
    assinaturas: subscriptions,
  }
}
