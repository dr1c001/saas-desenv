import { NextRequest, NextResponse } from "next/server"
import { emitNfse } from "@/actions/nfse"

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()
    const invoice = await emitNfse(orderId)
    return NextResponse.json({ ok: true, invoice })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
