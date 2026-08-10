import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

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
    // token_hash é sha224(email + otp de 6 dígitos) — só 10^6 combinações
    // possíveis por e-mail, todas pré-computáveis offline por quem conhece o
    // e-mail alvo. Rate limit por IP é a defesa prática contra tentar esse
    // espaço de busca inteiro contra este endpoint. (Achado em revisão de
    // segurança 2026-07-21.)
    const ip = await clientIp()
    const rateLimit = await checkRateLimit(`confirm:ip:${ip}`, 20, 15)
    if (rateLimit.allowed) {
      const supabase = await createClient()
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      if (!error) {
        return NextResponse.redirect(new URL(next, origin))
      }
    }
  }

  // Links do Supabase são de USO ÚNICO. Quem já aceitou o convite e abre o
  // e-mail de novo cai aqui — e antes recebia só "Link inválido ou expirado"
  // na tela de login, onde o botão mais visível é "Cadastrar empresa". O
  // resultado prático foi um integrante de equipe achando que precisava criar
  // uma empresa nova em vez de entrar na do empregador. A mensagem agora diz
  // exatamente o que fazer, e desaconselha explicitamente criar outra empresa.
  // (Relatado por cliente em 08/08/2026.)
  const te = await getTranslations("errors")
  const message =
    type === "invite" ? te("inviteLinkUsed") : type === "recovery" ? te("recoveryLinkUsed") : te("invalidLink")
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(message), origin))
}
