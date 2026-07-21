import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth"
import { NextResponse } from "next/server"

// Convite de equipe e recuperação de senha usam links de e-mail (GoTrue
// "generate_link"), não OAuth — o action_link que o Supabase gera pra esses
// aponta pro /auth/v1/verify hospedado por eles, que entrega a sessão via
// fragmento de URL (#access_token=...). Fragmento nunca chega no servidor
// (é só do browser), então uma rota de servidor nunca consegue ler isso —
// por isso usamos o hashed_token bruto direto (ver actions/team.ts e
// actions/auth.ts) apontando pra cá, e verificamos com verifyOtp() no
// servidor, que estabelece a sessão via cookie de verdade.
// (Achado testando o convite de equipe de ponta a ponta, 21/07/2026.)
const VALID_TYPES = ["invite", "recovery"] as const
type ConfirmType = (typeof VALID_TYPES)[number]

function isValidType(type: string | null): type is ConfirmType {
  return VALID_TYPES.includes(type as ConfirmType)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = safeNextPath(searchParams.get("next"))

  if (tokenHash && isValidType(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("Link inválido ou expirado."), origin))
}
