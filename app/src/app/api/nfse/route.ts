import { NextRequest, NextResponse } from "next/server"
import { emitNfse } from "@/actions/nfse"

// A emissão espera a nfe.io por até 10 s (lib/tempo-limite.ts), mais auth e
// consultas. Com o padrão da Vercel a função podia morrer ANTES do catch que
// mantém a reserva — resultado igual ao de antes do timeout existir.
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()
    const invoice = await emitNfse(orderId)
    return NextResponse.json({ ok: true, invoice })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
