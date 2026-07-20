import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

const EXTRA_DAYS = 7

// Called right after tenant creation when ?ref=CODE is in the register URL
export async function POST(req: NextRequest) {
  // Sem sessão + tenantId vindo do corpo, qualquer um podia chamar isso
  // repetidas vezes pro próprio tenantId (que já conhece) e estender o
  // trial indefinidamente. Agora o tenant vem da sessão, nunca do body.
  // (Achado em revisão de segurança 2026-07-19.)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } })
    if (!dbUser) return NextResponse.json({ ok: false }, { status: 401 })
    const tenantId = dbUser.tenantId

    const { referralCode } = await req.json()
    if (!referralCode) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const referrer = await prisma.tenant.findFirst({
      where: { referralCode },
      select: { id: true, name: true },
    })
    if (!referrer) return NextResponse.json({ ok: false, error: "Código inválido" })

    // Extend trial of new tenant
    const newTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!newTenant) return NextResponse.json({ ok: false })
    if (newTenant.referredByCode) {
      return NextResponse.json({ ok: false, error: "Indicação já aplicada" })
    }

    const newTrialEnd = new Date(newTenant.trialEndsAt ?? Date.now())
    newTrialEnd.setDate(newTrialEnd.getDate() + EXTRA_DAYS)

    // Idempotência atômica: a condição referredByCode:null no próprio UPDATE
    // garante que só uma requisição concorrente aplica o bônus — o check
    // separado acima (findUnique + if) sozinho permitia duas requisições
    // simultâneas passarem antes de qualquer uma escrever.
    // (Achado em revisão de segurança 2026-07-19.)
    const result = await prisma.tenant.updateMany({
      where: { id: tenantId, referredByCode: null },
      data: { trialEndsAt: newTrialEnd, referredByCode: referralCode },
    })
    if (result.count === 0) {
      return NextResponse.json({ ok: false, error: "Indicação já aplicada" })
    }

    return NextResponse.json({ ok: true, referrerName: referrer.name, extraDays: EXTRA_DAYS })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
