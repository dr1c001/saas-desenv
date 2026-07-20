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
export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 20, 15),
    checkRateLimit(`login:email:${email.toLowerCase()}`, 5, 15),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
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
}): Promise<{ error?: string; needsEmailConfirmation?: boolean }> {
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`register:ip:${ip}`, 8, 60),
    checkRateLimit(`register:email:${input.email.toLowerCase()}`, 3, 60),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { error: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente." }
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"

  // Always return the same generic message, whether or not the e-mail exists —
  // avoids leaking which e-mails are registered.
  const genericResult = {
    message: "Se este e-mail estiver cadastrado, enviamos um link de recuperação.",
  }

  // Limite por e-mail evita spammar a caixa de entrada de alguém com pedidos
  // repetidos de recuperação de senha.
  const rateLimit = await checkRateLimit(`reset:email:${email.toLowerCase()}`, 3, 60)
  if (!rateLimit.allowed) return genericResult

  if (!serviceRoleKey || !supabaseUrl) {
    console.error("requestPasswordReset: SUPABASE_SERVICE_ROLE_KEY não configurada")
    return genericResult
  }

  try {
    const redirectTo = `${appUrl}/api/auth/callback?next=/reset-password`

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ type: "recovery", email, options: { redirectTo } }),
    })
    const data = await res.json()

    if (data.action_link) {
      const user = await prisma.user.findFirst({ where: { email }, select: { name: true } })
      await sendPasswordResetEmail(email, user?.name ?? "", data.action_link).catch(() => null)
    }
  } catch (err) {
    console.error("requestPasswordReset error:", err)
  }

  return genericResult
}
