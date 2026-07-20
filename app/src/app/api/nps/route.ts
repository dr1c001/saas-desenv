import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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
