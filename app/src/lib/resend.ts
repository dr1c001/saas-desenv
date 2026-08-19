import { Resend } from "resend"
import { getTranslator } from "@/lib/i18n"
import { destinoDeEmailDeTeste, ehProducao, prefixoDeAssunto } from "@/lib/ambiente"

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
  const { error } = await getResend().emails.send(desviarSeForTeste(payload))
  if (error) throw new Error(`Resend: ${error.message}`)
}

/**
 * Fora de produção, TODO e-mail vai para um endereço só — o do dono.
 *
 * Este é o ponto mais perigoso de ter um ambiente de teste: o banco de teste é
 * uma cópia, e uma cópia tem os e-mails REAIS dos clientes finais. Um teste de
 * cobrança em atraso dispararia aviso de inadimplência para gente que não deve
 * nada. Aqui o destino é trocado antes de sair, e o assunto ganha prefixo pra
 * ninguém confundir com o e-mail de verdade.
 *
 * Se não houver endereço de teste configurado, o envio é abortado: sem destino
 * seguro, o certo é não enviar nada.
 */
function desviarSeForTeste<T extends { to: unknown; subject?: string }>(payload: T): T {
  if (ehProducao()) return payload

  const destino = destinoDeEmailDeTeste()
  if (!destino) {
    throw new Error(
      "Ambiente de teste sem STAGING_EMAIL/SUPER_ADMIN_EMAIL definido — " +
        "envio abortado pra não vazar e-mail pro cliente final."
    )
  }

  const originais = Array.isArray(payload.to) ? payload.to.join(", ") : String(payload.to)
  return {
    ...payload,
    to: destino,
    subject: `${prefixoDeAssunto()}${payload.subject ?? ""} → ${originais}`,
  }
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

export async function sendPaymentConfirmedEmail(
  to: string,
  name: string,
  planName: string,
  locale: "pt" | "en",
  /** Contrato + termo de LGPD. Vai anexado à confirmação de pagamento porque é
   *  o único e-mail que o cliente com certeza abre — mandar em separado seria
   *  mandar pro arquivo morto. */
  contrato?: { nomeArquivo: string; buffer: Buffer }
) {
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
        ${contrato ? `
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#374151;line-height:1.6;font-size:14px">
          ${t.markup("paymentConfirmed.contractAttached", STRONG)}
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">
          ${t("paymentConfirmed.contractHint")}
        </p>` : ""}
      </div>`,
    ...(contrato
      ? { attachments: [{ filename: contrato.nomeArquivo, content: contrato.buffer }] }
      : {}),
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

/**
 * Aviso de cobrança em atraso, ANTES do corte de acesso.
 *
 * Até 10/08/2026 o cliente inadimplente era bloqueado sem nenhum aviso: a
 * primeira notícia que ele tinha do problema era a equipe inteira parada na
 * tela de acesso expirado. Quem perde acesso sem aviso costuma tratar como
 * defeito do sistema, não como cobrança pendente — e cancela.
 *
 * `diasRestantes` vem de PAST_DUE_GRACE_DAYS (lib/auth.ts), nunca de um
 * número escrito aqui.
 */
export async function sendPastDueWarningEmail(
  to: string,
  name: string,
  companyName: string,
  diasRestantes: number,
  locale: "pt" | "en"
) {
  const t = getTranslator(locale, "emails")
  // O tom sobe conforme o prazo aperta: o primeiro aviso é um lembrete, o
  // último avisa que o acesso cai. Mesmo template, urgência diferente.
  const urgente = diasRestantes <= 2
  const cor = urgente ? "#dc2626" : "#f59e0b"

  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: t(urgente ? "pastDueWarning.subjectUrgent" : "pastDueWarning.subject", { days: diasRestantes }),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:${cor};margin-bottom:8px">${t("pastDueWarning.heading", { name })}</h1>
        <p style="color:#374151;line-height:1.6">
          ${t.markup("pastDueWarning.intro", { ...STRONG, company: companyName })}
        </p>
        <div style="background:#fef3c7;border-left:4px solid ${cor};padding:12px 16px;margin:20px 0;border-radius:4px">
          <p style="color:#92400e;margin:0;line-height:1.6">
            ${t.markup("pastDueWarning.deadline", { ...STRONG, days: diasRestantes })}
          </p>
        </div>
        <p style="color:#374151;line-height:1.6">${t("pastDueWarning.whatHappens")}</p>
        <a href="${APP_URL}/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:${cor};color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          ${t("pastDueWarning.cta")} →
        </a>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">
          ${t("pastDueWarning.alreadyPaid")}
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">${t("pastDueWarning.support")}</p>
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

/**
 * Aviso ao cliente FINAL do nosso cliente (não ao usuário do sistema).
 *
 * Texto vem pronto de lib/aviso-cliente.ts pra que WhatsApp e e-mail digam
 * exatamente a mesma coisa — divergir entre canais confunde quem recebe os
 * dois.
 */
export async function sendClientNoticeEmail(
  to: string,
  companyName: string,
  texto: string,
  locale: "pt" | "en"
) {
  const t = getTranslator(locale, "emails")
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `${companyName} — ${t("clientNotice.subject")}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px">${companyName}</h2>
        <p style="white-space:pre-line;line-height:1.6">${texto
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>
      </div>`,
  })
}

/**
 * Avisa o dono da plataforma que o cron diário falhou.
 *
 * Até 19/08/2026 o erro do cron era contado numa variável e esquecido: o
 * resultado ficava no corpo de uma resposta HTTP que ninguém lê. Um cron que
 * falha em silêncio significa cobrança que não sai, contrato recorrente que
 * não gera OS e cliente inadimplente sem aviso — tudo invisível até alguém
 * reclamar.
 *
 * Vai em texto simples e sem tradução de propósito: é e-mail de máquina para
 * uma pessoa só, o dono, e o que importa é chegar.
 */
export async function avisarFalhaDoCron(
  erros: number,
  detalhe: Record<string, unknown>
) {
  const para = process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!para) {
    console.error("[cron] falhou, mas SUPER_ADMIN_EMAIL não está definido — ninguém foi avisado.")
    return
  }

  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to: para,
    subject: `[ServiçoOS] Cron diário falhou (${erros} erro${erros > 1 ? "s" : ""})`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#dc2626;margin-bottom:8px">O cron diário terminou com erro</h2>
        <p style="color:#374151;line-height:1.6">
          Parte das tarefas de fundo não rodou. Enquanto isso não for resolvido,
          pode faltar aviso de cobrança, geração de OS de contrato recorrente e
          reconciliação de pagamento.
        </p>
        <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto">${
          JSON.stringify(detalhe, null, 2)
        }</pre>
        <p style="color:#6b7280;font-size:13px">
          Os detalhes do erro estão no log da função em
          <a href="https://vercel.com">vercel.com</a> e no Sentry.
        </p>
      </div>`,
  })
}
