import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  const token = process.env.ASAAS_ACCESS_TOKEN ?? ""
  const envInfo = {
    tokenLength: token.length,
    tokenPrefix: token.slice(0, 12),
    sandbox: process.env.ASAAS_SANDBOX ?? null,
  }
  try {
    const customer = await asaas.createCustomer({
      name: "Teste Diagnostico Claude",
      email: "teste-descartavel-claude@example.com",
    })
    return NextResponse.json({ ok: true, customerId: customer.id, envInfo })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), envInfo }, { status: 500 })
  }
}
