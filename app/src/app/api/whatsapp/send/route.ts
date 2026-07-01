import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { sendWhatsApp, buildOsMessage, buildQuoteMessage } from "@/lib/whatsapp"
import { formatCurrency, formatOsNumber } from "@/lib/utils"

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenant()
    const { type, id } = await req.json()

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant?.zapiInstance || !tenant?.zapiToken) {
      return NextResponse.json({ ok: false, error: "Configure o Z-API em Configurações → WhatsApp" }, { status: 400 })
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"

    if (type === "os") {
      const order = await prisma.serviceOrder.findUnique({
        where: { id, tenantId },
        include: { client: true },
      })
      if (!order) return NextResponse.json({ ok: false, error: "OS não encontrada" }, { status: 404 })
      const phone = order.client.whatsapp ?? order.client.phone
      if (!phone) return NextResponse.json({ ok: false, error: "Cliente sem WhatsApp/telefone" }, { status: 400 })

      const portalUrl = `${APP_URL}/p/${order.clientToken}`
      const osNum = formatOsNumber(order.number, order.createdAt)
      const message = buildOsMessage({ tenantName: tenant.name, osNumber: osNum, title: order.title, status: order.status, portalUrl })
      const ok = await sendWhatsApp(tenant.zapiInstance, tenant.zapiToken, phone, message)
      return NextResponse.json({ ok })
    }

    if (type === "quote") {
      const quote = await prisma.quote.findUnique({ where: { id, tenantId } })
      if (!quote) return NextResponse.json({ ok: false, error: "Orçamento não encontrado" }, { status: 404 })
      const phone = quote.clientContact
      if (!phone) return NextResponse.json({ ok: false, error: "Orçamento sem telefone de contato" }, { status: 400 })

      const portalUrl = `${APP_URL}/q/${quote.clientToken}`
      const year = new Date(quote.createdAt).getFullYear()
      const quoteNum = `${year}${String(quote.number).padStart(4, "0")}`
      const message = buildQuoteMessage({ tenantName: tenant.name, quoteNumber: quoteNum, amount: formatCurrency(Number(quote.amount)), portalUrl })
      const ok = await sendWhatsApp(tenant.zapiInstance, tenant.zapiToken, phone, message)
      return NextResponse.json({ ok })
    }

    return NextResponse.json({ ok: false, error: "Tipo inválido" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
