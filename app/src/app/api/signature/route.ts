import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenant()
    const { orderId, signature } = await req.json()

    if (!signature?.startsWith("data:image/")) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 400 })
    }

    const order = await prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId } })
    if (!order) return NextResponse.json({ ok: false, error: "OS não encontrada" }, { status: 404 })

    await prisma.serviceOrder.update({
      where: { id: orderId },
      data: { clientSignatureUrl: signature },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
