import { Resend } from "resend"
import { getTranslator } from "@/lib/i18n"

let resendClient: Resend | null = null

// Lazy: construir o client no import (nível de módulo) quebra o build em
// qualquer ambiente sem RESEND_API_KEY (ex.: CI) — o Next.js avalia rotas
// mesmo dinâmicas durante "collect page data", então o throw do construtor
// acontecia só de importar este arquivo, sem nenhum e-mail ser enviado.
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

const FROM = "ServiçoOS <noreply@servicoos.com.br>"
// Boas-vindas e onboarding convidam o cliente a "responder este e-mail", mas
// o remetente é um noreply — sem reply-to a resposta ia pra um endereço que
// não existe. (Achado em auditoria pré-venda, 2026-08-05.)
const REPLY_TO = "suporte@servicoos.com.br"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

// O idioma vem de quem chama (Tenant.locale), não do request: e-mail é
// disparado de cron/webhook/Server Action, fora do contexto que
// getTranslations() usa pra resolver locale sozinho. (i18n, item 1.)
//
// t.markup() em vez de t() nas mensagens com <strong> inline: o next-intl
// trata tag como rich text e exige um handler pra ela — markup devolve string
// (o que o corpo HTML espera), rich devolveria nó React, inútil aqui.
const STRONG = { strong: (chunks: string) => `<strong>${chunks}</strong>` }

// O SDK do Resend nunca rejeita a Promise — erro da API (domínio não
// verificado, destinatário inválido, rate limit) e falha de rede resolvem
// como { data: null, error }, não como exception. Todo try/catch/.catch()
// no resto do código (convite de equipe, cron de NPS, etc.) dependia de uma
// rejeição que nunca acontecia de verdade — falha real de envio nunca era
// detectada em lugar nenhum. Centraliza a checagem aqui em vez de repetir
// em cada função. (Achado verificando o sistema antes da primeira venda,
// 2026-08-03.)
async function send(payload: Parameters<ReturnType<typeof getResend>["emails"]["send"]>[0]) {
  const { error } = await getResend().emails.send(payload)
  if (error) throw new Error(`Resend: ${error.message}`)
}

export async function sendWelcomeEmail(to: string, name: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("welcome.subject"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">${t("welcome.heading", { name })}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t.markup("welcome.accountCreated", STRONG)}<br>
          ${t("welcome.nextStep")}
        </p>
        <a href="${APP_URL}/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("welcome.cta")} →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          ${t("welcome.support")}
        </p>
      </div>`,
  })
}

export async function sendTeamInviteEmail(to: string, name: string, companyName: string, inviteUrl: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("teamInvite.subject", { companyName }),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">${t("teamInvite.heading")}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t("teamInvite.greeting", { name })}<br>
          ${t.markup("teamInvite.invitedTo", { companyName, ...STRONG })}
        </p>
        <p style="color:#374151;line-height:1.6">
          ${t("teamInvite.instructions")}
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("teamInvite.cta")} →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          ${t("teamInvite.ignoreNotice")}
        </p>
      </div>`,
  })
}

export async function sendPaymentConfirmedEmail(to: string, name: string, planName: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("paymentConfirmed.subject", { planName }),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#16a34a;margin-bottom:8px">${t("paymentConfirmed.heading")}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t.markup("paymentConfirmed.planActive", { name, planName, ...STRONG })}<br>
          ${t("paymentConfirmed.thanks")}
        </p>
        <a href="${APP_URL}/dashboard"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("paymentConfirmed.cta")} →
        </a>
      </div>`,
  })
}

export async function sendOnboardingDay3Email(to: string, name: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("onboardingDay3.subject"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">${t("onboardingDay3.heading", { name })}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t.markup("onboardingDay3.notSubscribed", STRONG)}
        </p>
        <p style="color:#374151;line-height:1.6">${t("onboardingDay3.startNow")}</p>
        <ol style="color:#374151;line-height:2;padding-left:20px">
          <li>${t("onboardingDay3.step1")}</li>
          <li>${t.markup("onboardingDay3.step2", STRONG)}</li>
          <li>${t("onboardingDay3.step3")}</li>
          <li>${t("onboardingDay3.step4")}</li>
        </ol>
        <a href="${APP_URL}/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("onboardingDay3.cta")} →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          ${t("onboardingDay3.support")}
        </p>
      </div>`,
  })
}

export async function sendNpsEmail(to: string, name: string, osToken: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("nps.subject"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">${t("nps.heading", { name })}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t("nps.intro")}<br>
          ${t.markup("nps.question", STRONG)}
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:24px 0">
          ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `
            <a href="${APP_URL}/api/nps?token=${osToken}&score=${n}"
               style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;border:1px solid #e5e7eb;border-radius:8px;color:#374151;text-decoration:none;font-weight:600;font-size:14px">
              ${n}
            </a>`).join("")}
        </div>
        <p style="color:#6b7280;font-size:12px;margin-top:8px">${t("nps.scaleHint")}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:12px">${t("nps.ignoreNotice")}</p>
      </div>`,
  })
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string, locale: "pt" | "en") {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t("passwordReset.subject"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">${t("passwordReset.heading")}</h1>
        <p style="color:#374151;line-height:1.6">
          ${name ? t("passwordReset.greeting", { name }) : t("passwordReset.greetingNoName")}<br>
          ${t("passwordReset.requestReceived")}
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("passwordReset.cta")} →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          ${t("passwordReset.ignoreNotice")}
        </p>
      </div>`,
  })
}
