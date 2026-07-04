const BASE_URL = process.env.ASAAS_SANDBOX === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://www.asaas.com/api/v3"

// Nome incomum de propósito: nomes de env var que já foram removidos e
// recriados na Vercel (ASAAS_API_KEY, ASAAS_ACCESS_TOKEN) ficam permanentemente
// vazios em produção — um valor identico funciona sob um nome nunca antes usado.
// Nao renomear sem confirmar que o novo nome nunca foi usado antes no projeto.
const API_KEY = process.env.ASAAS_TOKEN_V3!

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

  async createSubscription(data: {
    customer: string
    billingType: "BOLETO" | "CREDIT_CARD" | "PIX"
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
