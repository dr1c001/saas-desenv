"use server"

import { prisma } from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/resend"

export async function requestPasswordReset(email: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"

  // Always return the same generic message, whether or not the e-mail exists —
  // avoids leaking which e-mails are registered.
  const genericResult = {
    message: "Se este e-mail estiver cadastrado, enviamos um link de recuperação.",
  }

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
