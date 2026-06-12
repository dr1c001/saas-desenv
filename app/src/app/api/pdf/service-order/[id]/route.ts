export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { ServiceOrderPDF } from "@/components/pdf/service-order-pdf"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
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
    select: { tenantId: true, tenant: { select: { name: true } } },
  })
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.serviceOrder.findUnique({
    where: { id, tenantId: dbUser.tenantId },
    include: {
      client: { include: { address: true } },
      technician: true,
      items: true,
    },
  })

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const element = React.createElement(ServiceOrderPDF, {
    order,
    companyName: dbUser.tenant.name,
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="OS-${order.number}.pdf"`,
    },
  })
}
