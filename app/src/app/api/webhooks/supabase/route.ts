import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Supabase Auth Hooks → Database Webhooks
// Configure in Supabase: Authentication → Hooks → "Send email" or use Database Webhooks
// pointing to: https://yourapp.com/api/webhooks/supabase
// with header: x-webhook-secret = WEBHOOK_SECRET env var

type AuthWebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE"
  table: string
  schema: string
  record: {
    id: string
    email: string
    raw_user_meta_data: {
      name?: string
      company_name?: string
    }
  }
  old_record: null | Record<string, unknown>
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret")
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: AuthWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Only handle new user inserts in auth.users
  if (payload.type !== "INSERT" || payload.table !== "users" || payload.schema !== "auth") {
    return NextResponse.json({ ok: true })
  }

  const { id, email, raw_user_meta_data } = payload.record
  const name = raw_user_meta_data?.name ?? email.split("@")[0]
  const companyName = raw_user_meta_data?.company_name ?? `Empresa de ${name}`

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: companyName },
      })
      await tx.user.create({
        data: { id, name, email, role: "OWNER", tenantId: tenant.id },
      })
    })
  } catch (err) {
    console.error("Webhook error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
