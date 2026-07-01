import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const { orderId, score, feedback } = await req.json()
    if (typeof score !== "number" || score < 0 || score > 10) {
      return NextResponse.json({ ok: false, error: "Score inválido" }, { status: 400 })
    }
    await prisma.serviceOrder.update({
      where: { id: orderId },
      data: { npsScore: score, npsFeedback: feedback || null },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
