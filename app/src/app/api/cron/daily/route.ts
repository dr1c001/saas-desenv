import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendOnboardingDay3Email,
  sendNpsEmail,
} from "@/lib/resend"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { geocodeAddress } from "@/lib/geocode"
import { gravarRetratoDoMes } from "@/lib/snapshot"

// O padrão da Vercel (10-15s) não cabe reconciliação da Asaas + e-mails +
// backfill de geocodificação no mesmo processo.
export const maxDuration = 60

// Mesma decodificação base64 usada em lib/asaas.ts (ver o porquê lá) — aqui a
// chave é lida direto pra não importar o módulo inteiro só por uma consulta.
const ASAAS_BASE =
  process.env.ASAAS_SANDBOX === "true"
    ? "https://sandbox.asaas.com/api/v3"
    : "https://www.asaas.com/api/v3"
const asaasKey = () => Buffer.from(process.env.ASAAS_TOKEN_B64!, "base64").toString("utf-8")

// Vercel Cron: runs every day at 09:00 BRT (12:00 UTC)
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 12 * * *" }] }

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results = { day3: 0, nps: 0, rateLimitCleanup: 0, stuckPending: 0, reconciled: 0, geocoded: 0, retrato: "", errors: 0 }

  // ── Rede de segurança: assinatura paga na Asaas mas presa em PENDING aqui ──
  // Em 07/08/2026 uma cliente pagou e ficou sem acesso por ~1 dia: os webhooks
  // da Asaas ainda apontavam pro domínio antigo (app-olive-six-67.vercel.app)
  // depois da migração pra servicoos.com.br, e a Asaas os marcou como
  // "interrupted" após as falhas. Nada no sistema percebia — o único sinal era
  // o cliente reclamando. Como PENDING bloqueia TODAS as abas (o layout do
  // dashboard manda pra /expired), a falha do webhook não parece "pagamento
  // não confirmado", parece "o sistema todo quebrou".
  //
  // Isto reconcilia direto na fonte da verdade (a Asaas) uma vez por dia, e é
  // idempotente: usa exatamente o mesmo caminho do webhook.
  try {
    // PAST_DUE entrou junto com o PENDING: o cliente inadimplente que paga é
    // reliberado pelo webhook, mas se ESSE webhook se perder ele fica bloqueado
    // sem nada perceber — mesmo defeito de 07/08, só que na renovação em vez da
    // primeira compra, e agora com a equipe inteira parada.
    const stuck = await prisma.subscription.findMany({
      where: { status: { in: ["PENDING", "PAST_DUE"] }, asaasId: { not: null } },
      select: {
        id: true, asaasId: true, tenantId: true, planId: true, status: true,
        billingCycle: true, currentPeriodEnd: true, lastProcessedPaymentId: true,
      },
    })
    results.stuckPending = stuck.length
    for (const sub of stuck) {
      const r = await fetch(`${ASAAS_BASE}/payments?subscription=${sub.asaasId}`, {
        headers: { access_token: asaasKey() },
      })
      if (!r.ok) { results.errors++; continue }
      const { data } = (await r.json()) as { data?: { id: string; status: string; dueDate?: string }[] }
      const quitados = (data ?? []).filter((p) => p.status === "RECEIVED" || p.status === "CONFIRMED")

      // A regra muda conforme o estado, e isso importa muito:
      //
      // PENDING nunca pagou nada — qualquer pagamento liquidado serve.
      //
      // PAST_DUE já pagou ciclos ANTERIORES. Aceitar "qualquer pagamento
      // liquidado" aqui reativaria de graça quem parou de pagar, porque os
      // pagamentos antigos continuam RECEIVED pra sempre na Asaas. Só vale um
      // pagamento ainda não processado E com vencimento a partir do ciclo que
      // venceu (1 dia de folga pra arredondamento de fuso).
      const paid =
        sub.status === "PENDING"
          ? quitados[0]
          : quitados.find(
              (p) =>
                p.id !== sub.lastProcessedPaymentId &&
                p.dueDate &&
                new Date(p.dueDate).getTime() >= sub.currentPeriodEnd.getTime() - 86_400_000
            )
      if (!paid) continue

      // Renovação estende o período; primeira confirmação não — mesmo cálculo
      // do webhook (ver api/webhooks/asaas/route.ts), que não pode divergir
      // deste sob pena de dar ou tirar um ciclo de acesso de graça.
      const periodEnd = new Date(sub.currentPeriodEnd)
      if (sub.status === "PAST_DUE") {
        periodEnd.setMonth(periodEnd.getMonth() + (sub.billingCycle === "YEARLY" ? 12 : 1))
      }

      console.error(
        `[reconciliacao] assinatura ${sub.asaasId} paga na Asaas (${paid.id}) mas ${sub.status} aqui — ` +
          `webhook provavelmente nao chegou. Reativando tenant ${sub.tenantId}.`
      )
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "ACTIVE", lastProcessedPaymentId: paid.id, currentPeriodEnd: periodEnd },
        }),
        prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { subscriptionStatus: "ACTIVE", planId: sub.planId },
        }),
      ])
      results.reconciled++
    }
  } catch (err) {
    console.error("[reconciliacao] falhou:", err)
    results.errors++
  }

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

  // ── Backfill de coordenadas: endereço salvo, mas sem lat/long ────────────────
  // geocodeAddress() só roda ao criar/editar o cliente e falha em silêncio.
  // Todo endereço que caiu numa dessas falhas ficou sem coordenada pra sempre,
  // e o efeito visível é a OS não aparecer no mapa — sem erro, sem aviso.
  // (Diagnosticado em 10/08/2026: das 5 primeiras contas em produção, 4
  // estavam nesse estado.) Roda por último e com orçamento de tempo curto:
  // se estourar, o que importa acima já foi gravado, e amanhã continua de onde
  // parou. Lote pequeno também respeita o limite de 1 req/s do Nominatim.
  const inicioBackfill = Date.now()
  const semCoordenada = await prisma.address.findMany({
    where: { latitude: null, OR: [{ city: { not: null } }, { street: { not: null } }] },
    select: { id: true, street: true, number: true, city: true, state: true },
    take: 10,
  })
  for (const addr of semCoordenada) {
    if (Date.now() - inicioBackfill > 25_000) break
    try {
      const coords = await geocodeAddress(addr)
      if (coords) {
        await prisma.address.update({ where: { id: addr.id }, data: coords })
        results.geocoded++
      }
    } catch { results.errors++ }
  }

  // ── Retrato mensal do negócio ────────────────────────────────────────────
  // Sempre a mesma linha do mês corrente: meses passados congelam com o último
  // valor real que tiveram, e o mês atual fica fresco. Sem job de virada de
  // mês — que seria mais uma coisa pra falhar calada.
  try {
    results.retrato = await gravarRetratoDoMes()
  } catch (err) {
    console.error("[retrato mensal] falhou:", err)
    results.errors++
  }

  return NextResponse.json({ ok: true, ...results })
}
