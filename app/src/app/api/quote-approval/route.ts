import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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
      select: { id: true },
    })
    if (!quote) return NextResponse.json({ ok: false, error: "Orçamento não encontrado" }, { status: 404 })

    await prisma.quote.update({ where: { id: quote.id }, data: { status } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
