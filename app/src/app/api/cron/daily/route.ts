import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendTrialExpiringEmail,
  sendOnboardingDay3Email,
  sendNpsEmail,
} from "@/lib/resend"

// Vercel Cron: runs every day at 09:00 BRT (12:00 UTC)
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 12 * * *" }] }

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results = { day3: 0, trialExpiring3: 0, trialExpiring1: 0, nps: 0, rateLimitCleanup: 0, errors: 0 }

  // ── Limpeza de rate limit expirado (janelas de no máximo 60min — qualquer
  // linha com mais de 24h já não afeta nenhuma checagem) ──────────────────────
  try {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const deleted = await prisma.authRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } })
    results.rateLimitCleanup = deleted.count
  } catch { results.errors++ }

  // ── Day 3 onboarding tip ─────────────────────────────────────────────────────
  const day3Start = new Date(now)
  day3Start.setDate(day3Start.getDate() - 3)
  day3Start.setHours(0, 0, 0, 0)
  const day3End = new Date(day3Start)
  day3End.setHours(23, 59, 59, 999)

  const day3Tenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: day3Start, lte: day3End }, subscriptionStatus: "TRIAL" },
    include: { users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } } },
  })
  for (const t of day3Tenants) {
    const owner = t.users[0]
    if (!owner?.email) continue
    try {
      await sendOnboardingDay3Email(owner.email, owner.name)
      results.day3++
    } catch { results.errors++ }
  }

  // ── Trial expiring in 3 days ──────────────────────────────────────────────────
  const in3Start = new Date(now)
  in3Start.setDate(in3Start.getDate() + 3)
  in3Start.setHours(0, 0, 0, 0)
  const in3End = new Date(in3Start)
  in3End.setHours(23, 59, 59, 999)

  const expiring3 = await prisma.tenant.findMany({
    where: { trialEndsAt: { gte: in3Start, lte: in3End }, subscriptionStatus: "TRIAL" },
    include: { users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } } },
  })
  for (const t of expiring3) {
    const owner = t.users[0]
    if (!owner?.email) continue
    try {
      await sendTrialExpiringEmail(owner.email, owner.name, 3)
      results.trialExpiring3++
    } catch { results.errors++ }
  }

  // ── Trial expiring in 1 day ───────────────────────────────────────────────────
  const in1Start = new Date(now)
  in1Start.setDate(in1Start.getDate() + 1)
  in1Start.setHours(0, 0, 0, 0)
  const in1End = new Date(in1Start)
  in1End.setHours(23, 59, 59, 999)

  const expiring1 = await prisma.tenant.findMany({
    where: { trialEndsAt: { gte: in1Start, lte: in1End }, subscriptionStatus: "TRIAL" },
    include: { users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } } },
  })
  for (const t of expiring1) {
    const owner = t.users[0]
    if (!owner?.email) continue
    try {
      await sendTrialExpiringEmail(owner.email, owner.name, 1)
      results.trialExpiring1++
    } catch { results.errors++ }
  }

  // ── NPS: OS concluded 7 days ago without NPS score ───────────────────────────
  const nps7Start = new Date(now)
  nps7Start.setDate(nps7Start.getDate() - 7)
  nps7Start.setHours(0, 0, 0, 0)
  const nps7End = new Date(nps7Start)
  nps7End.setHours(23, 59, 59, 999)

  const npsOrders = await prisma.serviceOrder.findMany({
    where: {
      status: "DONE",
      concludedAt: { gte: nps7Start, lte: nps7End },
      npsScore: null,
      clientToken: { not: null },
    },
    include: { client: { select: { email: true, name: true } } },
    take: 100,
  })
  for (const os of npsOrders) {
    if (!os.client.email || !os.clientToken) continue
    try {
      await sendNpsEmail(os.client.email, os.client.name, os.clientToken)
      results.nps++
    } catch { results.errors++ }
  }

  return NextResponse.json({ ok: true, ...results })
}
