// WhatsApp via Z-API (https://z-api.io)
// Tenant configures zapiInstance + zapiToken in /settings

import { getTranslator } from "@/lib/i18n"

type Locale = "pt" | "en"

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

// Estas mensagens vão pro cliente final do tenant (não pro usuário logado),
// disparadas de uma rota de API — fora do request context que
// getTranslations() usa. O idioma é o do tenant, passado explícito pelo
// chamador, mesmo padrão de lib/resend.ts e do portal público. (i18n.)
export function buildOsMessage(opts: {
  tenantName: string
  osNumber: string
  title: string
  status: string
  portalUrl: string
  locale: Locale
}) {
  const t = getTranslator(opts.locale, "whatsapp")
  const tc = getTranslator(opts.locale, "common")
  // status vem do banco como string — preserva o fallback pro valor cru que
  // o statusMap local tinha antes.
  const statusKey = `serviceOrderStatus.${opts.status}` as "serviceOrderStatus.OPEN"
  const statusLabel = tc.has(statusKey) ? tc(statusKey) : opts.status
  return (
    `*${opts.tenantName}*\n\n` +
    `${t("os.intro")}\n\n` +
    `📋 *${opts.osNumber} — ${opts.title}*\n` +
    `${t("os.statusLabel")}: ${statusLabel}\n\n` +
    `${t("os.trackLink")}: ${opts.portalUrl}`
  )
}

export function buildQuoteMessage(opts: {
  tenantName: string
  quoteNumber: string
  amount: string
  portalUrl: string
  locale: Locale
}) {
  const t = getTranslator(opts.locale, "whatsapp")
  return (
    `*${opts.tenantName}*\n\n` +
    `${t("quote.intro")}\n\n` +
    `💰 *${t("quote.quoteLabel")} #${opts.quoteNumber}*\n` +
    `${t("quote.amountLabel")}: ${opts.amount}\n\n` +
    `${t("quote.viewLink")}: ${opts.portalUrl}`
  )
}

export function buildNpsMessage(opts: { tenantName: string; portalUrl: string; locale: Locale }) {
  const t = getTranslator(opts.locale, "whatsapp")
  return (
    `*${opts.tenantName}*\n\n` +
    `${t("nps.completed")}\n\n` +
    `${t("nps.askOpinion")}\n` +
    `${t("nps.rateLink")}: ${opts.portalUrl}/nps`
  )
}
