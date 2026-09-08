import { bloquearForaDeProducao } from "@/lib/ambiente"

const BASE = "https://api.nfe.io/v1"

/** Remove cabeçalho marcado como `undefined`.
 *
 *  Serve ao envio de arquivo: `multipart/form-data` precisa de um boundary que
 *  só o fetch sabe gerar, e mandar `Content-Type: multipart/form-data` sem ele
 *  faz o servidor recusar sem dizer por quê. Marcar como undefined é a forma
 *  de dizer "não mande este". */
function limparIndefinidos(h: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(h).filter(([, v]) => v !== undefined)
  ) as Record<string, string>
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Emitir NFS-e gera documento fiscal de verdade, com número, na prefeitura.
  // Não existe "modo de teste" — ou emite, ou não emite. Fora de produção nem
  // tenta: uma nota emitida por engano precisa de cancelamento formal, com
  // prazo, e em alguns municípios não dá pra cancelar depois de certo tempo.
  bloquearForaDeProducao(`nfe.io ${path}`)

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    // `as` porque HeadersInit também aceita array e Headers; aqui só se passa
    // objeto simples, e o limparIndefinidos precisa enxergar as chaves.
    headers: limparIndefinidos({
      Authorization: process.env.NFEIO_API_KEY!,
      "Content-Type": "application/json",
      ...((options.headers ?? {}) as Record<string, string | undefined>),
    }),
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

  /**
   * Envia o certificado A1 da empresa para o emissor.
   *
   * ATENÇÃO A QUEM FOR MEXER: este é o único ponto da integração cuja forma
   * exata NÃO foi verificada contra a API real — foi escrito a partir da
   * documentação, e nenhuma empresa emitiu nota até hoje. `bloquearForaDeProducao`
   * impede ensaiar fora de produção, então a primeira execução vale de verdade.
   *
   * Se falhar, o erro do emissor sobe inteiro para a tela em vez de virar
   * "não foi possível": é ele que diz o que está errado no formato.
   *
   * `multipart/form-data` e não JSON: é arquivo binário. O `Content-Type` é
   * omitido de propósito para o fetch montar o boundary sozinho — passá-lo à
   * mão sem o boundary faz o servidor recusar sem explicar por quê.
   */
  async uploadCertificate(companyId: string, arquivo: Buffer, senha: string, nomeArquivo: string) {
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(arquivo)]), nomeArquivo)
    form.append("password", senha)

    return req<{ id?: string; status?: string; expiresOn?: string }>(
      `/companies/${companyId}/certificate`,
      { method: "POST", body: form, headers: { "Content-Type": undefined as unknown as string } }
    )
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

  /** O estado ATUAL de uma nota já enviada.
   *
   *  Existia desde sempre e NINGUÉM chamava — emissão é assíncrona, o estado
   *  devolvido na hora de emitir é quase sempre "processando", e sem perguntar
   *  de novo o sistema nunca soube se a prefeitura aceitou. Passou a ser usada
   *  pela conciliação diária em lib/nfse-conciliar.ts. */
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
