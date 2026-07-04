import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.ASAAS_API_KEY ?? ""
  const key2 = process.env.ASAAS_KEY_TEST2 ?? ""
  return NextResponse.json({
    asaasKeyLength: key.length,
    asaasKeyPrefix: key.slice(0, 12),
    asaasSandbox: process.env.ASAAS_SANDBOX ?? null,
    dollarTest: process.env.DOLLAR_TEST ?? null,
    keyTest2Length: key2.length,
    keyTest2Prefix: key2.slice(0, 12),
  })
}
