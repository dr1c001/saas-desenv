import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Allowlist estrita para o parâmetro "next": só caminho relativo simples.
// String concatenation direta (`${origin}${next}`) era vulnerável a
// "next=@evil.com/x" — a URL resultante "https://real-app.com@evil.com/x" é
// interpretada com "real-app.com" como userinfo e "evil.com" como host de
// verdade. Bloqueia também "//evil.com" e "/\evil.com" (protocol-relative —
// navegadores tratam \ como / em URLs http/https). (Revisão de segurança 2026-07-19.)
function safeNextPath(next: string | null): string {
  if (next && !next.startsWith("//") && /^\/[a-zA-Z0-9\-_/]*$/.test(next)) return next
  return "/dashboard"
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = safeNextPath(searchParams.get("next"))

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, origin))
}
