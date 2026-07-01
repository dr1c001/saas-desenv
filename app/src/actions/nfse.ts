"use server"

import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { nfeio } from "@/lib/nfeio"
import { revalidatePath } from "next/cache"

export async function registerFiscalCompany(formData: FormData) {
  const { tenantId } = await getTenant()

  const cnpj = (formData.get("cnpj") as string).replace(/\D/g, "")
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
  if (!tenant) throw new Error("Tenant não encontrado")

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
    },
  })

  revalidatePath("/settings/fiscal")
}

export async function emitNfse(orderId: string) {
  const { tenantId } = await getTenant()

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

  if (!order) throw new Error("OS não encontrada")
  if (!tenant?.nfeioCompanyId) throw new Error("Configure os dados fiscais em Configurações → Fiscal")
  if (order.nfseId) throw new Error("NFS-e já emitida para esta OS")

  const amount = Number(order.totalAmount)
  if (amount <= 0) throw new Error("OS sem valor — adicione itens antes de emitir NFS-e")

  const description =
    order.items.length > 0
      ? order.items.map((i) => i.description).join("; ")
      : order.title

  const clientDoc = order.client.document?.replace(/\D/g, "") || undefined
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
      issRate: 5,
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
