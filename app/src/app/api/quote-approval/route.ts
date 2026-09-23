import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTranslations } from "next-intl/server"
import { getTranslator } from "@/lib/i18n"
import { notificar } from "@/lib/notificar"

export async function POST(req: NextRequest) {
  try {
    const { quoteId, clientToken, status } = await req.json()
    // Chamado do portal público (sem sessão) — antes de achar o orçamento não
    // há de onde tirar o idioma do tenant, então essas duas validações de
    // formato usam o fallback do request context. (i18n.)
    const te = await getTranslations("errors")
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ ok: false, error: te("invalidStatus") }, { status: 400 })
    }
    if (!quoteId || !clientToken) {
      return NextResponse.json({ ok: false, error: te("invalidRequest") }, { status: 400 })
    }

    // quoteId sozinho não autentica nada — é o mesmo id usado em URLs internas
    // do dashboard. clientToken é o segredo que só quem recebeu o link do
    // portal público conhece. (Achado em revisão de segurança 2026-07-19.)
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId, clientToken },
      select: { id: true, tenantId: true, number: true, clientName: true, tenant: { select: { locale: true } } },
    })
    if (!quote) return NextResponse.json({ ok: false, error: te("quoteNotFound") }, { status: 404 })

    await prisma.quote.update({ where: { id: quote.id }, data: { status } })

    // Aprovação/recusa do cliente não avisava ninguém do lado do prestador —
    // só apareceria se alguém entrasse na aba Orçamentos por conta própria.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    //
    // Sem try/catch: `notificar` nunca lança, e envolver o que já se defende
    // sozinho só esconderia de quem lê que a garantia existe.
    const tn = getTranslator(quote.tenant.locale, "notifications")
    const key = status === "APPROVED" ? "quoteApproved" : "quoteRejected"
    await notificar({
      tenantId: quote.tenantId,
      evento: "orcamentoRespondido",
      corpo: tn(`${key}.body` as "quoteApproved.body", {
        client: quote.clientName,
        number: quote.number,
      }),
      url: "/quotes",
      referencia: quote.id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
