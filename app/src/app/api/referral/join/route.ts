import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const EXTRA_DAYS = 7

// Called right after tenant creation when ?ref=CODE is in the register URL
export async function POST(req: NextRequest) {
  try {
    const { tenantId, referralCode } = await req.json()
    if (!tenantId || !referralCode) {
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

    const newTrialEnd = new Date(newTenant.trialEndsAt ?? Date.now())
    newTrialEnd.setDate(newTrialEnd.getDate() + EXTRA_DAYS)

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { trialEndsAt: newTrialEnd, referredByCode: referralCode },
    })

    return NextResponse.json({ ok: true, referrerName: referrer.name, extraDays: EXTRA_DAYS })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
