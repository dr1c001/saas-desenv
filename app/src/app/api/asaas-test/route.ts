import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  try {
    const customer = await asaas.createCustomer({
      name: "Teste Final Diagnostico Claude",
      email: "teste-descartavel-claude-final@example.com",
    })
    return NextResponse.json({ ok: true, customerId: customer.id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
