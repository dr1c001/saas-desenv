import { Resend } from "resend"

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

export async function sendWelcomeEmail(to: string, name: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Bem-vindo ao ServiçoOS — escolha seu plano para começar`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Bem-vindo, ${name}! 🎉</h1>
        <p style="color:#374151;line-height:1.6">
          Sua conta no <strong>ServiçoOS</strong> foi criada com sucesso.<br>
          Falta só um passo: escolha um plano para liberar o acesso ao sistema.
        </p>
        <a href="${APP_URL}/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Ver planos e assinar →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Tem dúvidas? Responda este e-mail que te ajudamos.
        </p>
      </div>`,
  })
}

export async function sendTeamInviteEmail(to: string, name: string, companyName: string, inviteUrl: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Você foi convidado para a equipe ${companyName} — ServiçoOS`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Você foi convidado! 🎉</h1>
        <p style="color:#374151;line-height:1.6">
          Olá, ${name}!<br>
          Você foi convidado para fazer parte da equipe <strong>${companyName}</strong> no ServiçoOS.
        </p>
        <p style="color:#374151;line-height:1.6">
          Clique no botão abaixo para aceitar o convite e criar sua senha de acesso.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Aceitar convite →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Se você não esperava este convite, pode ignorar este e-mail com segurança.
        </p>
      </div>`,
  })
}

export async function sendPaymentConfirmedEmail(to: string, name: string, planName: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Pagamento confirmado — Plano ${planName} ativo!`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#16a34a;margin-bottom:8px">✅ Pagamento confirmado!</h1>
        <p style="color:#374151;line-height:1.6">
          Olá, ${name}! Seu plano <strong>${planName}</strong> está ativo.<br>
          Obrigado por assinar o ServiçoOS!
        </p>
        <a href="${APP_URL}/dashboard"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Acessar o sistema →
        </a>
      </div>`,
  })
}

export async function sendOnboardingDay3Email(to: string, name: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Sua empresa ainda não está usando o ServiçoOS`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Olá, ${name}! 👋</h1>
        <p style="color:#374151;line-height:1.6">
          Você criou sua conta no <strong>ServiçoOS</strong> há 3 dias, mas ainda não escolheu um plano —
          por isso o acesso ao sistema continua bloqueado.
        </p>
        <p style="color:#374151;line-height:1.6">Assine agora e comece a usar na hora:</p>
        <ol style="color:#374151;line-height:2;padding-left:20px">
          <li>Cadastre um cliente (ou use um existente)</li>
          <li>Clique em <strong>+ Nova OS</strong></li>
          <li>Preencha os dados e salve</li>
          <li>Envie o PDF direto para o cliente 🎉</li>
        </ol>
        <a href="${APP_URL}/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Ver planos e assinar →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Precisa de ajuda? Responda este e-mail que te ajudamos.
        </p>
      </div>`,
  })
}

export async function sendNpsEmail(to: string, name: string, osToken: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Como foi sua experiência com o ServiçoOS?`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Olá, ${name}! 🙏</h1>
        <p style="color:#374151;line-height:1.6">
          Você concluiu uma OS no ServiçoOS. Queremos saber sua opinião!<br>
          Em uma escala de 0 a 10, <strong>o quanto você indicaria o ServiçoOS</strong> para outros empresários?
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:24px 0">
          ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `
            <a href="${APP_URL}/api/nps?token=${osToken}&score=${n}"
               style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;border:1px solid #e5e7eb;border-radius:8px;color:#374151;text-decoration:none;font-weight:600;font-size:14px">
              ${n}
            </a>`).join("")}
        </div>
        <p style="color:#6b7280;font-size:12px;margin-top:8px">0 = não indicaria · 10 = com certeza indicaria</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:12px">Se preferir não responder, ignore este e-mail.</p>
      </div>`,
  })
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
  return send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Recuperação de senha — ServiçoOS`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Redefinir senha</h1>
        <p style="color:#374151;line-height:1.6">
          ${name ? `Olá, ${name}!` : "Olá!"}<br>
          Recebemos uma solicitação para redefinir a senha da sua conta no ServiçoOS.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Criar nova senha →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Se você não solicitou essa alteração, pode ignorar este e-mail com segurança —
          sua senha atual continua válida. Este link expira em breve por segurança.
        </p>
      </div>`,
  })
}
