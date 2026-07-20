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

const FROM = "ServiçoOS <noreply@app-olive-six-67.vercel.app>"

export async function sendWelcomeEmail(to: string, name: string, trialDays = 15) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Bem-vindo ao ServiçoOS — seu teste de ${trialDays} dias começa agora!`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Bem-vindo, ${name}! 🎉</h1>
        <p style="color:#374151;line-height:1.6">
          Sua conta no <strong>ServiçoOS</strong> foi criada com sucesso.<br>
          Você tem <strong>${trialDays} dias grátis</strong> para testar tudo sem precisar de cartão.
        </p>
        <a href="https://app-olive-six-67.vercel.app/dashboard"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Acessar o sistema →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Tem dúvidas? Responda este e-mail que te ajudamos.<br>
          <a href="https://app-olive-six-67.vercel.app/billing" style="color:#7c3aed">Ver planos e preços</a>
        </p>
      </div>`,
  })
}

export async function sendTrialExpiringEmail(to: string, name: string, daysLeft: number) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Seu teste gratuito expira em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} — ServiçoOS`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#f97316;margin-bottom:8px">⏰ Atenção, ${name}!</h1>
        <p style="color:#374151;line-height:1.6">
          Seu período de teste gratuito no <strong>ServiçoOS</strong> expira em
          <strong>${daysLeft} dia${daysLeft !== 1 ? "s" : ""}</strong>.
        </p>
        <p style="color:#374151;line-height:1.6">
          Para continuar usando sem interrupções, assine um dos nossos planos:
        </p>
        <ul style="color:#374151;line-height:2">
          <li><strong>Starter</strong> — R$ 97/mês (até 3 usuários)</li>
          <li><strong>Pro</strong> — R$ 197/mês (até 10 usuários + Mapa GPS)</li>
          <li><strong>Enterprise</strong> — R$ 397/mês (ilimitado + NFS-e)</li>
        </ul>
        <a href="https://app-olive-six-67.vercel.app/billing"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Escolher meu plano →
        </a>
      </div>`,
  })
}

export async function sendTeamInviteEmail(to: string, name: string, companyName: string, inviteUrl: string) {
  return getResend().emails.send({
    from: FROM,
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
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Pagamento confirmado — Plano ${planName} ativo!`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#16a34a;margin-bottom:8px">✅ Pagamento confirmado!</h1>
        <p style="color:#374151;line-height:1.6">
          Olá, ${name}! Seu plano <strong>${planName}</strong> está ativo.<br>
          Obrigado por assinar o ServiçoOS!
        </p>
        <a href="https://app-olive-six-67.vercel.app/dashboard"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Acessar o sistema →
        </a>
      </div>`,
  })
}

export async function sendOnboardingDay3Email(to: string, name: string) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Dica do ServiçoOS: crie sua primeira OS em 2 minutos`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Olá, ${name}! 👋</h1>
        <p style="color:#374151;line-height:1.6">
          Você já está há 3 dias com o ServiçoOS. Que tal criar sua primeira Ordem de Serviço?
        </p>
        <p style="color:#374151;line-height:1.6">É simples:</p>
        <ol style="color:#374151;line-height:2;padding-left:20px">
          <li>Cadastre um cliente (ou use um existente)</li>
          <li>Clique em <strong>+ Nova OS</strong></li>
          <li>Preencha os dados e salve</li>
          <li>Envie o PDF direto para o cliente 🎉</li>
        </ol>
        <a href="https://app-olive-six-67.vercel.app/service-orders/new"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Criar minha primeira OS →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#6b7280;font-size:13px">
          Precisa de ajuda? Responda este e-mail que te ajudamos.<br>
          Seu trial ainda tem <strong>12 dias</strong> — aproveite ao máximo!
        </p>
      </div>`,
  })
}

export async function sendNpsEmail(to: string, name: string, osToken: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"
  return getResend().emails.send({
    from: FROM,
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
            <a href="${appUrl}/api/nps?token=${osToken}&score=${n}"
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
  return getResend().emails.send({
    from: FROM,
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

export async function sendReferralWelcomeEmail(to: string, name: string, referrerCompany: string, extraDays: number) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Você ganhou ${extraDays} dias extras no ServiçoOS!`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="color:#7c3aed;margin-bottom:8px">Presente de boas-vindas! 🎁</h1>
        <p style="color:#374151;line-height:1.6">
          Olá, ${name}!<br>
          A empresa <strong>${referrerCompany}</strong> te indicou o ServiçoOS e você ganhou
          <strong>${extraDays} dias extras</strong> no seu período de teste — totalizando ${15 + extraDays} dias grátis!
        </p>
        <a href="https://app-olive-six-67.vercel.app/dashboard"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Acessar o sistema →
        </a>
      </div>`,
  })
}
