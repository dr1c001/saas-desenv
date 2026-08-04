export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { ReceiptPDF } from "@/components/pdf/receipt-pdf"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { requireActiveSubscription } from "@/lib/auth"
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
    select: { tenantId: true, tenant: { select: { name: true, logoUrl: true } } },
  })
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Bloqueio de assinatura é só de página — essa rota é despachável direto
  // via HTTP, independente da UI. (Achado em revisão de segurança
  // pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(dbUser.tenantId)

  const { id } = await params
  // O PDF estampa "PAGO" incondicionalmente (receipt-pdf.tsx) — sem esse
  // filtro, dava pra gerar um recibo de "pago" pra uma receita PENDING ou
  // OVERDUE (nunca recebida) só sabendo o id, que aparece normalmente em
  // /finance. (Achado verificando o sistema antes da primeira venda,
  // 2026-08-03.)
  const receipt = await prisma.revenue.findUnique({
    where: { id, tenantId: dbUser.tenantId, status: "PAID" },
    include: { order: { select: { number: true, createdAt: true, title: true } } },
  })

  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const element = React.createElement(ReceiptPDF, {
    receipt,
    companyName: dbUser.tenant.name,
    logoUrl: dbUser.tenant.logoUrl,
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Recibo-${id.slice(-8).toUpperCase()}.pdf"`,
    },
  })
}
