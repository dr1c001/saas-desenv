"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { getTranslations } from "next-intl/server"

// Exportação self-service de dados (LGPD art. 18 — portabilidade).
//
// ─── O que estava faltando ───────────────────────────────────────────────────
//
// Até 22/09/2026 esta função levava 11 tabelas, e os três documentos (Política
// de Privacidade, Termos e contrato) prometiam "todos os dados". Ficavam de
// fora vinte modelos com `tenantId` — contratos recorrentes, estoque inteiro,
// patrimônio, fornecedores, cotações, compras, filiais, campos personalizados,
// permissões, histórico de OS — e, o mais grave, o RASTRO DE GPS da equipe,
// que escapou porque `UserLocation` é chaveado por `userId` e não por
// `tenantId`. É o dado mais sensível da relação entre empregador e técnico, e
// justamente o que um pedido do art. 18 costuma querer.
//
// ─── O que fica de fora, e por quê ───────────────────────────────────────────
//
// SEGREDO não sai, nunca: `ApiKey.hash` (o hash da chave de integração) e
// `FiscalCertificate.arquivo`/`senha` (o certificado A1 e a senha dele). Não
// são "dados pessoais" no sentido da lei, e exportá-los transformaria um
// pedido de portabilidade num vazamento de credencial. Do que é seguro dizer
// sobre eles — que existem, quando foram criados, até quando valem — vai o
// metadado.
//
// PLATAFORMA não sai: `PlatformAlert` é o alarme interno do ServiçoOS sobre
// esta empresa (atraso, cancelamento), não é dado dela.
//
// Restrito a OWNER — mesmo nível já usado para a configuração fiscal, dado que
// isto reúne PII de toda a equipe e de todos os clientes.
export async function exportTenantData() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER") throw new Error((await getTranslations("common"))("noPermission"))

  const deste = { where: { tenantId } }

  const [
    tenant,
    users,
    localizacoes,
    clients,
    serviceOrders,
    orderEvents,
    quotes,
    equipment,
    providers,
    maintenanceOrders,
    revenues,
    expenses,
    subscriptions,
    contratos,
    filiais,
    fornecedores,
    pecas,
    locaisDeEstoque,
    movimentosDeEstoque,
    cotacoes,
    compras,
    bens,
    lancamentosDoBalanco,
    camposPersonalizados,
    permissoesDeAba,
    permissoesDeAcao,
    chavesDeApi,
    certificado,
    filaOffline,
    conversasDeSuporte,
    acessosDaPlataforma,
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
        locale: true,
        vocabulary: true,
        disabledFeatures: true,
        commissionBase: true,
        commissionBulkPay: true,
        dunningConfig: true,
        clientNotifications: true,
        referralCode: true,
        referredByCode: true,
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
        branchId: true,
        userAddress: true,
      },
    }),
    // O RASTRO DE GPS. Chaveado por usuário, e não por empresa — foi por isso
    // que escapou da exportação por dois meses.
    prisma.userLocation.findMany({
      where: { user: { tenantId } },
      select: { userId: true, latitude: true, longitude: true, accuracy: true, updatedAt: true },
    }),
    prisma.client.findMany({ ...deste, include: { address: true } }),
    prisma.serviceOrder.findMany({
      ...deste,
      include: { items: true, checklist: true, attachments: true },
    }),
    // O histórico de cada OS: quem mudou o quê e quando.
    prisma.orderEvent.findMany(deste),
    prisma.quote.findMany(deste),
    prisma.equipment.findMany(deste),
    prisma.provider.findMany(deste),
    prisma.maintenanceOrder.findMany({ ...deste, include: { items: true } }),
    prisma.revenue.findMany(deste),
    prisma.expense.findMany(deste),
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
        // O registro do aceite: é prova de autoria, e é dado da empresa.
        contractVersion: true,
        acceptedAt: true,
        acceptedIp: true,
        plan: { select: { name: true } },
      },
    }),
    prisma.serviceContract.findMany(deste),
    prisma.branch.findMany(deste),
    prisma.supplier.findMany(deste),
    prisma.part.findMany(deste),
    prisma.stockLocation.findMany({ ...deste, include: { balances: true } }),
    prisma.stockMovement.findMany(deste),
    prisma.quotation.findMany({ ...deste, include: { items: true, participants: true } }),
    prisma.purchaseOrder.findMany({ ...deste, include: { items: true } }),
    prisma.asset.findMany(deste),
    prisma.balanceEntry.findMany(deste),
    prisma.customField.findMany(deste),
    prisma.tabPermission.findMany(deste),
    prisma.actionPermission.findMany(deste),
    // Metadado apenas: o `hash` da chave nunca sai.
    prisma.apiKey.findMany({
      where: { tenantId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    }),
    // Metadado apenas: o arquivo do certificado e a senha nunca saem.
    prisma.fiscalCertificate.findFirst({
      where: { tenantId },
      select: { nomeArquivo: true, validoAte: true },
    }),
    prisma.offlineOperation.findMany(deste),
    prisma.supportThread.findMany({ ...deste, include: { messages: true } }),
    // Quando alguém do ServiçoOS acessou esta empresa. É informação SOBRE ela,
    // e é o que dá sentido à transparência do art. 18.
    prisma.adminAuditLog.findMany({
      where: { tenantId },
      select: { action: true, detail: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return {
    exportadoEm: new Date().toISOString(),
    empresa: tenant,
    usuarios: users,
    localizacoesDaEquipe: localizacoes,
    clientes: clients,
    ordensDeServico: serviceOrders,
    historicoDasOrdens: orderEvents,
    orcamentos: quotes,
    equipamentos: equipment,
    prestadores: providers,
    ordensDeManutencao: maintenanceOrders,
    receitas: revenues,
    despesas: expenses,
    assinaturas: subscriptions,
    contratosRecorrentes: contratos,
    filiais,
    fornecedores,
    pecas,
    locaisDeEstoque,
    movimentosDeEstoque,
    cotacoes,
    ordensDeCompra: compras,
    bens,
    lancamentosDoBalanco,
    camposPersonalizados,
    permissoesDeAba,
    permissoesDeAcao,
    chavesDeApi,
    certificadoFiscal: certificado,
    filaOffline,
    conversasDeSuporte,
    acessosDaPlataforma,
  }
}
