// WhatsApp via Z-API (https://z-api.io)
// Tenant configures zapiInstance + zapiToken in /settings

interface SendTextPayload {
  phone: string // "5511999999999" (with country code, no +)
  message: string
}

export async function sendWhatsApp(
  instance: string,
  token: string,
  phone: string,
  message: string
): Promise<boolean> {
  const raw = phone.replace(/\D/g, "")
  // DDD 55 é real (Santa Maria/RS) — um número local "5599XXXXXXXX" (11
  // dígitos, DDD 55 + celular) começa com "55" sem ter código de país
  // nenhum. Só considera que já tem código de país quando o tamanho bate com
  // isso (12 = DDD+fixo, 13 = DDD+celular), não só pelo prefixo — senão esse
  // DDD específico ficava sempre sem o "55" do país, e a mensagem ia pra um
  // número errado/inválido. (Achado verificando o sistema antes da primeira
  // venda, 2026-08-03.)
  const hasCountryCode = raw.startsWith("55") && (raw.length === 12 || raw.length === 13)
  const normalized = hasCountryCode ? raw : `55${raw}`

  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, message } satisfies SendTextPayload),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

export function buildOsMessage(opts: {
  tenantName: string
  osNumber: string
  title: string
  status: string
  portalUrl: string
}) {
  const statusMap: Record<string, string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    DONE: "Concluída",
    INVOICED: "Faturada",
    CANCELLED: "Cancelada",
  }
  return (
    `*${opts.tenantName}*\n\n` +
    `Olá! Sua Ordem de Serviço foi atualizada.\n\n` +
    `📋 *${opts.osNumber} — ${opts.title}*\n` +
    `Status: ${statusMap[opts.status] ?? opts.status}\n\n` +
    `Acompanhe sua OS: ${opts.portalUrl}`
  )
}

export function buildQuoteMessage(opts: {
  tenantName: string
  quoteNumber: string
  amount: string
  portalUrl: string
}) {
  return (
    `*${opts.tenantName}*\n\n` +
    `Você recebeu um novo orçamento!\n\n` +
    `💰 *Orçamento #${opts.quoteNumber}*\n` +
    `Valor: R$ ${opts.amount}\n\n` +
    `Visualize e aprove: ${opts.portalUrl}`
  )
}

export function buildNpsMessage(opts: { tenantName: string; portalUrl: string }) {
  return (
    `*${opts.tenantName}*\n\n` +
    `O serviço foi concluído! 🎉\n\n` +
    `Gostaríamos muito de saber sua opinião.\n` +
    `Avalie o atendimento (leva menos de 1 minuto): ${opts.portalUrl}/nps`
  )
}
