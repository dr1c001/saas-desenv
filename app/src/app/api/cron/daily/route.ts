import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendOnboardingDay3Email,
  sendNpsEmail,
} from "@/lib/resend"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"

// Vercel Cron: runs every day at 09:00 BRT (12:00 UTC)
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 12 * * *" }] }

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results = { day3: 0, nps: 0, rateLimitCleanup: 0, errors: 0 }

  // ── Limpeza de rate limit expirado (janelas de no máximo 60min — qualquer
  // linha com mais de 24h já não afeta nenhuma checagem) ──────────────────────
  try {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const deleted = await prisma.authRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } })
    results.rateLimitCleanup = deleted.count
  } catch { results.errors++ }

  // ── Lembrete no dia 3 pra quem se cadastrou e ainda não assinou ──────────────
  // new Date() + setHours(0,0,0,0) zera pra meia-noite UTC (horário do
  // servidor), não meia-noite de Brasília — um tenant criado à noite (BRT)
  // podia cair no dia UTC seguinte e nunca bater exatamente com essa janela,
  // recebendo o lembrete um dia adiantado/atrasado. Mesmo padrão BRT-aware já
  // usado em dashboard.ts/finance.ts/reports.ts. (Achado em auditoria
  // pré-venda, 2026-08-05.)
  const { year, month, day } = todayInBRT()
  const day3Start = brtMidnightUTC(year, month, day - 3)
  const day3End = brtMidnightUTC(year, month, day - 2)

  const day3Tenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: day3Start, lt: day3End }, subscriptionStatus: "TRIAL" },
    include: { users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } } },
  })
  for (const t of day3Tenants) {
    const owner = t.users[0]
    if (!owner?.email) continue
    try {
      await sendOnboardingDay3Email(owner.email, owner.name, t.locale)
      results.day3++
    } catch { results.errors++ }
  }

  // ── NPS: OS concluída há 7+ dias, nunca contatada ────────────────────────────
  // Três correções juntas aqui (achado verificando o cron de NPS, 2026-07-28):
  // 1. status só considerava "DONE" — completeServiceOrder com
  //    invoiceImmediately=true vai direto pra "INVOICED" sem nunca passar por
  //    "DONE" (concludedAt é setado nos dois casos). Na prática, a maioria
  //    das OS concluídas em produção está em "INVOICED" e nunca era pega.
  // 2. concludedAt exigia bater EXATAMENTE 7 dias atrás — se o cron não
  //    rodasse naquele dia exato (ou clientToken estivesse nulo, como estava
  //    até a correção anterior), a OS ficava pra sempre sem chance de NPS.
  //    Agora pega qualquer OS com 7+ dias ainda não contatada, cobrindo
  //    atrasados.
  // 3. usava npsScore como trava de "já processado" — só é setado quando o
  //    cliente responde, então quem ignora o e-mail (a própria mensagem diz
  //    "se preferir não responder, ignore") receberia um e-mail novo por dia,
  //    pra sempre. npsSentAt marca a tentativa, independente da resposta.
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const npsOrders = await prisma.serviceOrder.findMany({
    where: {
      status: { in: ["DONE", "INVOICED"] },
      concludedAt: { lte: sevenDaysAgo },
      npsSentAt: null,
      npsScore: null,
      clientToken: { not: null },
    },
    include: {
      client: { select: { email: true, name: true } },
      // A pesquisa vai pro cliente final, mas quem "fala" é a empresa: sai no
      // idioma dela (Tenant.locale), igual à OS e ao PDF. (i18n, item 1.)
      tenant: { select: { locale: true } },
    },
    take: 100,
  })
  for (const os of npsOrders) {
    if (!os.client.email || !os.clientToken) continue
    try {
      await sendNpsEmail(os.client.email, os.client.name, os.clientToken, os.tenant.locale)
      await prisma.serviceOrder.update({ where: { id: os.id }, data: { npsSentAt: new Date() } })
      results.nps++
    } catch { results.errors++ }
  }

  return NextResponse.json({ ok: true, ...results })
}
