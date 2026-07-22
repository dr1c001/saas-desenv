import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

// Espelha NEW_SIGNUP_DISCOUNT_PERCENT em lib/auth.ts (mesmo conceito, caminho
// de aplicar o código depois do cadastro em vez de na hora do cadastro).
const NEW_SIGNUP_DISCOUNT_PERCENT = 10
const MAX_DISCOUNT_PERCENT = 100

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
    // Sem isso, o próprio tenant podia usar o próprio código e creditar
    // desconto pra si mesmo sem nunca ter indicado ninguém de verdade.
    // (Achado em revisão de segurança 2026-07-21.)
    if (referrer.id === tenantId) {
      return NextResponse.json({ ok: false, error: "Você não pode usar seu próprio código de indicação" })
    }

    const newTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!newTenant) return NextResponse.json({ ok: false })
    if (newTenant.referredByCode) {
      return NextResponse.json({ ok: false, error: "Indicação já aplicada" })
    }

    // Idempotência atômica: a condição referredByCode:null no próprio UPDATE
    // garante que só uma requisição concorrente aplica o bônus — o check
    // separado acima (findUnique + if) sozinho permitia duas requisições
    // simultâneas passarem antes de qualquer uma escrever.
    // (Achado em revisão de segurança 2026-07-19.)
    const result = await prisma.tenant.updateMany({
      where: { id: tenantId, referredByCode: null },
      data: {
        referredByCode: referralCode,
        referralDiscountPercent: { increment: NEW_SIGNUP_DISCOUNT_PERCENT },
      },
    })
    if (result.count === 0) {
      return NextResponse.json({ ok: false, error: "Indicação já aplicada" })
    }

    // Esse tenant pode já estar perto do teto por bônus de indicador (webhook
    // do Asaas) — sem isso, o increment acima podia passar de 100% e virar
    // preço negativo em subscribeToPlan. Condicionado no valor atual da linha
    // (não num valor lido antes), seguro mesmo sob corrida.
    // (Achado em revisão de segurança 2026-07-21.)
    await prisma.tenant.updateMany({
      where: { id: tenantId, referralDiscountPercent: { gt: MAX_DISCOUNT_PERCENT } },
      data: { referralDiscountPercent: MAX_DISCOUNT_PERCENT },
    })

    return NextResponse.json({ ok: true, referrerName: referrer.name, discountPercent: NEW_SIGNUP_DISCOUNT_PERCENT })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
