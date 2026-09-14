import { ehProducao } from "@/lib/ambiente"

// Fora de produção usa SEMPRE o sandbox, independente da variável: um deploy
// de teste que herde a chave de produção por engano criaria cobrança de
// verdade no cartão do cliente. A variável continua valendo pra poder testar
// em sandbox dentro da própria produção.
const USAR_SANDBOX = !ehProducao() || process.env.ASAAS_SANDBOX === "true"

const BASE_URL = USAR_SANDBOX
  ? "https://sandbox.asaas.com/api/v3"
  : "https://www.asaas.com/api/v3"

// A chave fica em base64 na env var (ASAAS_TOKEN_B64) em vez de texto puro.
// Isso contorna um problema real observado na Vercel de producao: o valor
// literal da chave do Asaas (comeca com "$", contem ":") as vezes chegava
// vazio em process.env mesmo com a variavel configurada corretamente,
// de forma inconsistente e sem causa identificada. Em base64 o valor so
// contem [A-Za-z0-9+/=], eliminando qualquer char especial como suspeito.
//
// Decodificada dentro da função (não no escopo do módulo): em ambientes sem
// essa env var (ex.: CI) o Buffer.from(undefined, ...) lançaria só de importar
// este arquivo, quebrando o build de qualquer rota que use Asaas.
function getApiKey(): string {
  return Buffer.from(process.env.ASAAS_TOKEN_B64!, "base64").toString("utf-8")
}

async function asaasRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "access_token": getApiKey(),
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

export type AsaasPayment = {
  id: string
  status: string
  invoiceUrl: string
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

  /**
   * Muda o valor de uma assinatura viva.
   *
   * Existe por causa do desconto de indicação. Ele é vendido como "10% no
   * primeiro pagamento", mas a assinatura da Asaas cobra o `value` em TODO
   * ciclo — então o desconto virava vitalício, e com 100% acumulado a
   * assinatura nascia valendo R$ 0,00 para sempre.
   *
   * `updatePendingPayments: false` é o que faz a promessa valer: a primeira
   * fatura, já gerada com desconto, fica como está; só as próximas saem pelo
   * preço cheio.
   *
   * ATENÇÃO — não verificado contra a Asaas. O verbo e o formato vieram da
   * documentação, e este projeto não tem como exercitar a API real em teste. A
   * falha aqui é benigna de propósito (quem chama registra e segue), mas isto
   * precisa de uma passada no sandbox antes de ser considerado entregue.
   */
  async updateSubscription(id: string, data: { value: number; updatePendingPayments?: boolean }) {
    return asaasRequest<AsaasSubscription>(`/subscriptions/${id}`, {
      method: "POST",
      body: JSON.stringify({ updatePendingPayments: false, ...data }),
    })
  },

  async cancelSubscription(id: string) {
    return asaasRequest(`/subscriptions/${id}`, { method: "DELETE" })
  },

  async getSubscription(id: string) {
    return asaasRequest<AsaasSubscription>(`/subscriptions/${id}`)
  },

  // A primeira fatura ja fica disponivel logo apos criar a assinatura —
  // invoiceUrl e a pagina hospedada pelo Asaas onde o cliente preenche os
  // dados e o cartao (ou opta por boleto). O ServiçoOS nunca ve os dados do cartao.
  async getFirstInvoiceUrl(subscriptionId: string): Promise<string | null> {
    const res = await asaasRequest<{ data: AsaasPayment[] }>(
      `/payments?subscription=${subscriptionId}&limit=1`
    )
    return res.data[0]?.invoiceUrl ?? null
  },
}
