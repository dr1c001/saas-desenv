import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

export async function GET() {
  Sentry.captureException(new Error("ServicoOS: teste de configuracao do Sentry"))
  await Sentry.flush(2000)
  return NextResponse.json({ ok: true, sent: true })
}
