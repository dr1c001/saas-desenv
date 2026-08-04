import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPushToUser } from "@/lib/push"

export async function POST(req: NextRequest) {
  try {
    const { quoteId, clientToken, status } = await req.json()
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido" }, { status: 400 })
    }
    if (!quoteId || !clientToken) {
      return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 })
    }

    // quoteId sozinho não autentica nada — é o mesmo id usado em URLs internas
    // do dashboard. clientToken é o segredo que só quem recebeu o link do
    // portal público conhece. (Achado em revisão de segurança 2026-07-19.)
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId, clientToken },
      select: { id: true, tenantId: true, number: true, clientName: true },
    })
    if (!quote) return NextResponse.json({ ok: false, error: "Orçamento não encontrado" }, { status: 404 })

    await prisma.quote.update({ where: { id: quote.id }, data: { status } })

    // Aprovação/recusa do cliente não avisava ninguém do lado do prestador —
    // só apareceria se alguém entrasse na aba Orçamentos por conta própria.
    // Melhor esforço: nunca deve derrubar a aprovação em si.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    try {
      const subs = await prisma.pushSubscription.findMany({
        where: { user: { tenantId: quote.tenantId, role: { in: ["OWNER", "ADMIN"] } } },
        select: { endpoint: true, p256dh: true, auth: true },
      })
      if (subs.length > 0) {
        await sendPushToUser(subs, {
          title: status === "APPROVED" ? "Orçamento aprovado! 🎉" : "Orçamento recusado",
          body: `${quote.clientName} ${status === "APPROVED" ? "aprovou" : "recusou"} o orçamento #${quote.number}`,
          url: "/quotes",
        })
      }
    } catch {
      // não derruba a aprovação por falha de push
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
