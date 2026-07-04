import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  const directRead = process.env.ASAAS_TOKEN_V3 ?? ""
  const directInfo = { length: directRead.length, prefix: directRead.slice(0, 12) }
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
