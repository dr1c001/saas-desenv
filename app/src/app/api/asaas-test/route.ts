import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  const b64Raw = process.env.ASAAS_TOKEN_B64 ?? ""
  const decoded = b64Raw ? Buffer.from(b64Raw, "base64").toString("utf-8") : ""
  const directInfo = { b64RawLength: b64Raw.length, decodedLength: decoded.length, decodedPrefix: decoded.slice(0, 12) }
  try {
    const customer = await asaas.createCustomer({
      name: "Teste Final Diagnostico Claude",
      email: "teste-descartavel-claude-final@example.com",
    })
    return NextResponse.json({ ok: true, customerId: customer.id, directInfo })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), directInfo }, { status: 500 })
  }
}
