import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { sendWhatsApp, buildOsMessage, buildQuoteMessage } from "@/lib/whatsapp"
import { formatCurrency, formatOsNumber } from "@/lib/utils"
import { getTranslations } from "next-intl/server"

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenant()
    // Bloqueio de assinatura é só de página — essa rota é despachável direto
    // via HTTP, independente da UI. (Achado em revisão de segurança
    // pré-lançamento, 2026-07-28.)
    await requireActiveSubscription(tenantId)
    const { type, id } = await req.json()
    // Erros voltam pro usuário logado (whatsapp-button exibe data.error), então
    // seguem o idioma dele; já o CONTEÚDO da mensagem vai pro cliente final e
    // usa tenant.locale, passado explícito pros builders. (i18n.)
    const te = await getTranslations("errors")

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return NextResponse.json({ ok: false, error: te("companyNotFound") }, { status: 404 })
    if (!tenant.zapiInstance || !tenant.zapiToken) {
      return NextResponse.json({ ok: false, error: te("configureZapi") }, { status: 400 })
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

    if (type === "os") {
      const order = await prisma.serviceOrder.findUnique({
        where: { id, tenantId },
        include: { client: true },
      })
      if (!order) return NextResponse.json({ ok: false, error: te("orderNotFound") }, { status: 404 })
      const phone = order.client.whatsapp ?? order.client.phone
      if (!phone) return NextResponse.json({ ok: false, error: te("clientWithoutPhone") }, { status: 400 })

      const portalUrl = `${APP_URL}/p/${order.clientToken}`
      const osNum = formatOsNumber(order.number, order.createdAt)
      const message = buildOsMessage({ tenantName: tenant.name, osNumber: osNum, title: order.title, status: order.status, portalUrl, locale: tenant.locale })
      const ok = await sendWhatsApp(tenant.zapiInstance, tenant.zapiToken, phone, message)
      return NextResponse.json({ ok })
    }

    if (type === "quote") {
      const quote = await prisma.quote.findUnique({ where: { id, tenantId } })
      if (!quote) return NextResponse.json({ ok: false, error: te("quoteNotFound") }, { status: 404 })
      const phone = quote.clientContact
      if (!phone) return NextResponse.json({ ok: false, error: te("quoteWithoutPhone") }, { status: 400 })

      const portalUrl = `${APP_URL}/q/${quote.clientToken}`
      const year = new Date(quote.createdAt).getFullYear()
      const quoteNum = `${year}${String(quote.number).padStart(4, "0")}`
      const message = buildQuoteMessage({ tenantName: tenant.name, quoteNumber: quoteNum, amount: formatCurrency(Number(quote.amount)), portalUrl, locale: tenant.locale })
      const ok = await sendWhatsApp(tenant.zapiInstance, tenant.zapiToken, phone, message)
      return NextResponse.json({ ok })
    }

    return NextResponse.json({ ok: false, error: te("invalidType") }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
