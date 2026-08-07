export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { QuotePDF } from "@/components/pdf/quote-pdf"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { requireActiveSubscription } from "@/lib/auth"
import { getTranslator } from "@/lib/i18n"
import React, { type ReactElement, type JSXElementConstructor } from "react"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, tenant: { select: { name: true, logoUrl: true, phone: true, address: true, website: true, locale: true } } },
  })
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Bloqueio de assinatura é só de página — essa rota é despachável direto
  // via HTTP, independente da UI. (Achado em revisão de segurança
  // pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(dbUser.tenantId)

  const { id } = await params
  const quote = await prisma.quote.findUnique({
    where: { id, tenantId: dbUser.tenantId },
  })

  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // O PDF é renderizado fora do request context do Next.js — o locale do
  // tenant precisa ser passado explícito. (Item 1 do roadmap, 06/08/2026.)
  const locale = dbUser.tenant.locale
  const t = getTranslator(locale, "pdf")

  const buildElement = (logoUrl: string | null) => {
    return React.createElement(QuotePDF, {
      quote,
      companyName: dbUser.tenant.name,
      logoUrl,
      companyPhone: dbUser.tenant.phone,
      companyAddress: dbUser.tenant.address,
      companyWebsite: dbUser.tenant.website,
      locale,
    }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>
  }

  // @react-pdf/image busca a logoUrl de verdade durante a renderização — se
  // o link cair/for removido, a geração do PDF quebrava inteira (500
  // genérico) em vez de só a logo sumir. Tenta de novo sem logo antes de
  // desistir. (Achado verificando o sistema antes da primeira venda,
  // 2026-08-03.)
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(buildElement(dbUser.tenant.logoUrl))
  } catch (err) {
    console.error("Falha ao gerar PDF de orçamento com logo, tentando sem logo:", err)
    try {
      buffer = await renderToBuffer(buildElement(null))
    } catch (err2) {
      console.error("Falha ao gerar PDF de orçamento mesmo sem logo:", err2)
      return NextResponse.json({ error: t("errors.generateFailed") }, { status: 500 })
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // Header HTTP é ASCII — os valores de fileNamePrefix são sem acento.
      "Content-Disposition": `inline; filename="${t("quote.fileNamePrefix")}-${quote.number}.pdf"`,
    },
  })
}
