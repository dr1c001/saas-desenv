import { Resend } from "resend"

export const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = "ServiçoOS <noreply@app-olive-six-67.vercel.app>"

export async function sendWelcomeEmail(to: string, name: string, trialDays = 15) {
  return resend.emails.send({
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
  return resend.emails.send({
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
  return resend.emails.send({
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
  return resend.emails.send({
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
