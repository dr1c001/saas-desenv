const BASE_URL = process.env.ASAAS_SANDBOX === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://www.asaas.com/api/v3"

// A chave fica em base64 na env var (ASAAS_TOKEN_B64) em vez de texto puro.
// Isso contorna um problema real observado na Vercel de producao: o valor
// literal da chave do Asaas (comeca com "$", contem ":") as vezes chegava
// vazio em process.env mesmo com a variavel configurada corretamente,
// de forma inconsistente e sem causa identificada. Em base64 o valor so
// contem [A-Za-z0-9+/=], eliminando qualquer char especial como suspeito.
const API_KEY = Buffer.from(process.env.ASAAS_TOKEN_B64!, "base64").toString("utf-8")

async function asaasRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "access_token": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Asaas ${path} → ${res.status}: ${body}`)
  }
  return res.json()
}

export type AsaasCustomer = {
  id: string
  name: string
  email: string
  cpfCnpj?: string
}

export type AsaasSubscription = {
  id: string
  status: string
  nextDueDate: string
  value: number
  cycle: "MONTHLY" | "YEARLY"
}

export const asaas = {
  async createCustomer(data: { name: string; email: string; cpfCnpj?: string }) {
    return asaasRequest<AsaasCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async updateCustomer(id: string, data: { cpfCnpj?: string }) {
    return asaasRequest<AsaasCustomer>(`/customers/${id}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async createSubscription(data: {
    customer: string
    // PIX nao e permitido para assinaturas nesta conta Asaas (erro invalid_billingType).
    // UNDEFINED deixa o cliente escolher a forma de pagamento na fatura gerada
    // pelo Asaas (boleto, cartao ou pix avulso na fatura) — requer cpfCnpj no cliente.
    billingType: "BOLETO" | "CREDIT_CARD" | "UNDEFINED"
    value: number
    nextDueDate: string
    cycle: "MONTHLY" | "YEARLY"
    description: string
  }) {
    return asaasRequest<AsaasSubscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async cancelSubscription(id: string) {
    return asaasRequest(`/subscriptions/${id}`, { method: "DELETE" })
  },

  async getSubscription(id: string) {
    return asaasRequest<AsaasSubscription>(`/subscriptions/${id}`)
  },
}
