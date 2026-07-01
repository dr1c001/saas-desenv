import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const { quoteId, status } = await req.json()
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido" }, { status: 400 })
    }
    await prisma.quote.update({ where: { id: quoteId }, data: { status } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
