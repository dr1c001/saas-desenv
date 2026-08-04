import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Os links de nota (0-10) no e-mail de NPS (lib/resend.ts, sendNpsEmail) são
// uma navegação GET pra /api/nps?token=...&score=... — mas só existia POST
// aqui, esperando { orderId, clientToken, score } no corpo. Clicar em
// qualquer nota do e-mail dava 405. clientToken sozinho já é suficiente pra
// achar a OS (é @unique), orderId nunca foi necessário nesse fluxo.
// (Achado verificando o sistema antes da primeira venda, 2026-07-28.)
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const clientToken = searchParams.get("token")
  if (!clientToken) return NextResponse.redirect(new URL("/", origin))

  // Number(null) é 0 — sem essa checagem, um GET só com ?token= (sem score,
  // ex: scanner de e-mail corporativo pré-buscando o link antes da entrega)
  // gravava nota 0 sem ninguém ter clicado em nada.
  // (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
  const scoreParam = searchParams.get("score")
  const score = scoreParam === null ? NaN : Number(scoreParam)
  if (Number.isInteger(score) && score >= 0 && score <= 10) {
    await prisma.serviceOrder.updateMany({ where: { clientToken }, data: { npsScore: score } })
  }

  return NextResponse.redirect(new URL(`/p/${clientToken}`, origin))
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, clientToken, score, feedback } = await req.json()
    if (typeof score !== "number" || score < 0 || score > 10) {
      return NextResponse.json({ ok: false, error: "Score inválido" }, { status: 400 })
    }
    if (!orderId || !clientToken) {
      return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 })
    }

    // orderId sozinho não autentica nada — é o mesmo id usado em URLs internas
    // do dashboard. clientToken é o segredo que só quem recebeu o link do
    // portal público conhece. (Achado em revisão de segurança 2026-07-19.)
    const order = await prisma.serviceOrder.findUnique({
      where: { id: orderId, clientToken },
      select: { id: true },
    })
    if (!order) return NextResponse.json({ ok: false, error: "Ordem não encontrada" }, { status: 404 })

    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { npsScore: score, npsFeedback: feedback || null },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
