import { bloquearForaDeProducao } from "@/lib/ambiente"

const BASE = "https://api.nfe.io/v1"

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Emitir NFS-e gera documento fiscal de verdade, com número, na prefeitura.
  // Não existe "modo de teste" — ou emite, ou não emite. Fora de produção nem
  // tenta: uma nota emitida por engano precisa de cancelamento formal, com
  // prazo, e em alguns municípios não dá pra cancelar depois de certo tempo.
  bloquearForaDeProducao(`nfe.io ${path}`)

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: process.env.NFEIO_API_KEY!,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`nfe.io ${path} → ${res.status}: ${body}`)
  }
  return res.json()
}

export type NfeioCompany = {
  id: string
  name: string
  federalTaxNumber: number
  municipalTaxNumber?: string
  address: { city: { code: string; name: string }; state: string }
}

export type NfeioInvoice = {
  id: string
  flowStatus: string
  number?: string
  checkCode?: string
  rpsNumber?: number
  servicesAmount?: number
  issuedOn?: string
  cancelledOn?: string
  pdf?: { url?: string }
  xml?: { url?: string }
}

export const nfeio = {
  async createCompany(data: {
    name: string
    federalTaxNumber: string
    municipalTaxNumber?: string
    email: string
    address: {
      country: string
      postalCode: string
      street: string
      number: string
      additionalInformation?: string
      district: string
      city: { code: string; name: string }
      state: string
    }
    specialTaxRegime?: number
    rpsSerialNumber?: string
    issRate?: number
  }) {
    return req<NfeioCompany>("/companies", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async getCompany(id: string) {
    return req<NfeioCompany>(`/companies/${id}`)
  },

  async emitNfse(companyId: string, data: {
    borrower: {
      federalTaxNumber?: string
      name: string
      email?: string
      address?: {
        country: string
        postalCode?: string
        street?: string
        number?: string
        district?: string
        city: { code: string; name: string }
        state: string
      }
    }
    services: {
      description: string
      amount: number
      issRate?: number
      cityTaxCode?: string
    }
  }) {
    return req<NfeioInvoice>(`/companies/${companyId}/serviceinvoices`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async getInvoice(companyId: string, invoiceId: string) {
    return req<NfeioInvoice>(`/companies/${companyId}/serviceinvoices/${invoiceId}`)
  },

  async cancelInvoice(companyId: string, invoiceId: string) {
    return req(`/companies/${companyId}/serviceinvoices/${invoiceId}`, { method: "DELETE" })
  },

  async listCities(search: string) {
    return req<{ cities: { code: string; name: string; state: string }[] }>(
      `/cities?search=${encodeURIComponent(search)}`
    )
  },
}
