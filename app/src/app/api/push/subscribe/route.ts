import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

// Hosts reais de serviço de push dos navegadores suportados. Sem essa
// allowlist, qualquer usuário autenticado podia registrar um endpoint
// apontando pra rede interna — o servidor faz um POST real pra lá ao enviar
// a próxima notificação (SSRF cego, via web-push). (Revisão de segurança 2026-07-19.)
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
]

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const { protocol, hostname } = new URL(endpoint)
    if (protocol !== "https:") return false
    return ALLOWED_PUSH_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId: user.id, endpoint } },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { endpoint } = await req.json()
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } })
  }

  return NextResponse.json({ ok: true })
}
