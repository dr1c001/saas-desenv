"use server"

import { prisma } from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/resend"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// login/cadastro chamavam o Supabase direto do browser (sem passar pelo
// nosso servidor), então um rate limit só em rota nossa não protegia nada —
// dava pra bater direto na API do Supabase. Movido pra Server Action, com
// limite por IP (bloqueia automação de um único lugar) e por e-mail
// (bloqueia força bruta distribuída contra uma conta específica).
// (Roadmap de segurança — item 2.)
export async function signIn(
  email: string,
  password: string,
): Promise<{ error?: string; errorCode?: "RATE_LIMIT" }> {
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 20, 15),
    checkRateLimit(`login:email:${email.toLowerCase()}`, 5, 15),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    // Código estável em vez de frase pronta: quem monta o texto é a página,
    // via next-intl, respeitando o idioma do visitante. (i18n, item 1.)
    return { errorCode: "RATE_LIMIT" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? { error: error.message } : {}
}

export async function signUpUser(input: {
  email: string
  password: string
  name: string
  companyName: string
  refCode?: string
}): Promise<{ error?: string; errorCode?: "RATE_LIMIT"; needsEmailConfirmation?: boolean }> {
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`register:ip:${ip}`, 8, 60),
    checkRateLimit(`register:email:${input.email.toLowerCase()}`, 3, 60),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    // Ver comentário em signIn: código estável, texto traduzido na página.
    return { errorCode: "RATE_LIMIT" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
        company_name: input.companyName,
        ref_code: input.refCode || undefined,
      },
    },
  })
  if (error) return { error: error.message }
  return { needsEmailConfirmation: !data.session }
}

export async function requestPasswordReset(email: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

  // Always return the same generic result, whether or not the e-mail exists —
  // avoids leaking which e-mails are registered. O texto em si mora na página
  // (next-intl): devolver um resultado constante mantém a propriedade acima e
  // ainda respeita o idioma do visitante. (i18n, item 1.)
  const genericResult = { ok: true as const }

  // Limite por e-mail evita spammar a caixa de entrada de alguém com pedidos
  // repetidos de recuperação de senha.
  const rateLimit = await checkRateLimit(`reset:email:${email.toLowerCase()}`, 3, 60)
  if (!rateLimit.allowed) return genericResult

  if (!serviceRoleKey || !supabaseUrl) {
    console.error("requestPasswordReset: SUPABASE_SERVICE_ROLE_KEY não configurada")
    return genericResult
  }

  try {
    // redirectTo aqui so precisa ser uma URL valida pra API aceitar a chamada —
    // nao usamos o action_link que ela geraria (ver comentario abaixo).
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ type: "recovery", email, redirectTo: appUrl }),
    })
    const data = await res.json()

    // Usamos hashed_token direto (nao data.action_link): o action_link aponta pro
    // /auth/v1/verify hospedado pelo Supabase, que entrega a sessao via fragmento
    // de URL (#access_token=...) — fragmento nunca chega no servidor, entao
    // /api/auth/callback (que so entende ?code=) nunca conseguiria processar isso.
    // /api/auth/confirm recebe o hashed_token bruto por query string e chama
    // verifyOtp() no servidor, que estabelece a sessao via cookie de verdade.
    // (Achado testando o convite de equipe de ponta a ponta, 21/07/2026.)
    if (data.hashed_token) {
      const resetLink = `${appUrl}/api/auth/confirm?token_hash=${data.hashed_token}&type=recovery&next=/reset-password`
      // locale vem do tenant do usuário: o e-mail sai no idioma da empresa,
      // igual ao resto do sistema. Sem linha de User (conta no Supabase sem
      // cadastro nosso ainda) não há tenant pra consultar — cai no default.
      // (i18n, item 1.)
      const user = await prisma.user.findFirst({
        where: { email },
        select: { name: true, tenant: { select: { locale: true } } },
      })
      // A mensagem pro usuário fica genérica de propósito (não vazar se o
      // e-mail existe), mas uma falha de envio de verdade precisa aparecer
      // em algum log — senão ninguém percebe que ninguém está recebendo o
      // link de recuperação. (Achado verificando o sistema antes da
      // primeira venda, 2026-08-03.)
      await sendPasswordResetEmail(email, user?.name ?? "", resetLink, user?.tenant.locale ?? "pt").catch((err) => {
        console.error("Falha ao enviar e-mail de recuperação de senha:", err)
      })
    }
  } catch (err) {
    console.error("requestPasswordReset error:", err)
  }

  return genericResult
}
