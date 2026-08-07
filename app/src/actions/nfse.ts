"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { nfeio } from "@/lib/nfeio"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

export async function registerFiscalCompany(formData: FormData) {
  const { tenantId, role } = await getTenant()
  // Página /settings/fiscal já é OWNER-only — a action precisa da mesma
  // checagem, senão ADMIN/TECHNICIAN chamam direto e sobrescrevem o CNPJ/
  // config fiscal usado em toda nota futura. (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  // A partir de 01/08/2026 a Receita Federal passa a emitir CNPJ alfanumérico
  // (letras nas 12 primeiras posições, ex: "12ABC345000A92") — \D removia
  // qualquer letra, corrompendo o documento antes de mandar pro nfe.io.
  // Mantém letras/dígitos, só remove pontuação (., /, -).
  // (Achado verificando o sistema de NFS-e, 2026-07-22.)
  const cnpj = (formData.get("cnpj") as string).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const municipalTaxNumber = formData.get("municipalTaxNumber") as string
  const email = formData.get("email") as string
  const postalCode = (formData.get("postalCode") as string).replace(/\D/g, "")
  const street = formData.get("street") as string
  const number = formData.get("number") as string
  const district = formData.get("district") as string
  const cityCode = formData.get("cityCode") as string
  const cityName = formData.get("cityName") as string
  const state = formData.get("state") as string
  const issRate = parseFloat((formData.get("issRate") as string) || "5")

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new Error((await getTranslations("errors"))("tenantNotFound"))

  const company = await nfeio.createCompany({
    name: tenant.name,
    federalTaxNumber: cnpj,
    municipalTaxNumber: municipalTaxNumber || undefined,
    email,
    address: {
      country: "BRA",
      postalCode,
      street,
      number,
      district,
      city: { code: cityCode, name: cityName },
      state,
    },
    issRate,
    rpsSerialNumber: "1",
  })

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      nfeioCompanyId: company.id,
      fiscalCnpj: cnpj,
      fiscalMunicipalCode: cityCode,
      fiscalCityName: cityName,
      fiscalStateCode: state,
      fiscalIssRate: issRate,
    },
  })

  revalidatePath("/settings/fiscal")
}

export async function emitNfse(orderId: string) {
  const { tenantId, role } = await getTenant()
  // Emite nota fiscal real e irreversível (sem cancelamento implementado no
  // produto) — não pode ficar acessível a qualquer papel.
  // (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  const [order, tenant] = await Promise.all([
    prisma.serviceOrder.findUnique({
      where: { id: orderId, tenantId },
      include: {
        client: { include: { address: true } },
        items: true,
      },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ])

  const te = await getTranslations("errors")
  if (!order) throw new Error(te("orderNotFound"))
  if (!tenant?.nfeioCompanyId) throw new Error(te("configureFiscal"))
  if (order.nfseId) throw new Error(te("nfseAlreadyIssued"))

  const amount = Number(order.totalAmount)
  if (amount <= 0) throw new Error(te("orderWithoutAmount"))

  const description =
    order.items.length > 0
      ? order.items.map((i) => i.description).join("; ")
      : order.title

  // Mesmo motivo do cnpj em registerFiscalCompany acima — o documento do
  // cliente (CNPJ, se for pessoa jurídica) pode vir com letras a partir de
  // 01/08/2026. CPF continua só numérico, então isso não afeta esse caso.
  const clientDoc = order.client.document?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || undefined
  const addr = order.client.address

  const invoice = await nfeio.emitNfse(tenant.nfeioCompanyId, {
    borrower: {
      federalTaxNumber: clientDoc,
      name: order.client.name,
      email: order.client.email ?? undefined,
      address: addr
        ? {
            country: "BRA",
            postalCode: addr.zipCode?.replace(/\D/g, "") ?? undefined,
            street: addr.street ?? undefined,
            number: addr.number ?? undefined,
            district: addr.district ?? undefined,
            city: {
              code: tenant.fiscalMunicipalCode ?? "3550308",
              name: addr.city ?? tenant.fiscalCityName ?? "",
            },
            state: addr.state ?? tenant.fiscalStateCode ?? "",
          }
        : undefined,
    },
    services: {
      description,
      amount,
      issRate: tenant.fiscalIssRate ?? 5,
    },
  })

  await prisma.serviceOrder.update({
    where: { id: orderId },
    data: {
      nfseId: invoice.id,
      nfseStatus: invoice.flowStatus,
      nfseNumber: invoice.number ?? null,
      nfseUrl: invoice.pdf?.url ?? null,
      status: "INVOICED",
    },
  })

  revalidatePath("/service-orders")
  return invoice
}

export async function getFiscalStatus() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      nfeioCompanyId: true,
      fiscalCnpj: true,
      fiscalCityName: true,
      fiscalStateCode: true,
    },
  })
}
