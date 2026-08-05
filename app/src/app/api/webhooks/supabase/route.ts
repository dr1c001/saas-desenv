import { NextRequest, NextResponse } from "next/server"

// Supabase Auth Hooks → Database Webhooks
// Configure in Supabase: Authentication → Hooks → "Send email" or use Database Webhooks
// pointing to: https://yourapp.com/api/webhooks/supabase
// with header: x-webhook-secret = WEBHOOK_SECRET env var
//
// Este webhook criava Tenant+User diretamente no INSERT de auth.users — um
// SEGUNDO caminho de criação de conta, independente e mais simples que
// getTenant() (lib/auth.ts), que já é quem trata isso hoje (dedup por
// corrida, código de indicação, e-mail de boas-vindas). Se este webhook
// estiver configurado no painel do Supabase, ele corre pra criar a linha
// ANTES do primeiro getTenant() do usuário — e a versão dele não manda
// e-mail de boas-vindas nem credita indicação, então getTenant() encontra o
// User já existente e nunca roda essa parte. Desativado (vira no-op 200,
// pra não quebrar se o Supabase ainda chamar) até confirmar se está mesmo
// configurado — se não estiver, o hook em si pode ser removido do painel.
// (Achado em auditoria pré-venda, 2026-08-05.)

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret")
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
