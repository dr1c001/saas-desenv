import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.ASAAS_API_KEY ?? ""
  return NextResponse.json({
    asaasKeyLength: key.length,
    asaasKeyPrefix: key.slice(0, 12),
    asaasSandbox: process.env.ASAAS_SANDBOX ?? null,
    dollarTest: process.env.DOLLAR_TEST ?? null,
  })
}
