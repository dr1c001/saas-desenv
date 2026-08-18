export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { ServiceOrderPDF } from "@/components/pdf/service-order-pdf"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { requireActiveSubscription } from "@/lib/auth"
import { getTranslator } from "@/lib/i18n"
import { baixarArquivo } from "@/lib/storage"
import { caminhoPertenceAoTenant } from "@/lib/foto"
import { diasDeGarantia, garantiaAte, prazoPorExtenso } from "@/lib/garantia"
import { formatDate } from "@/lib/utils"
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
    select: { tenantId: true, tenant: { select: { name: true, logoUrl: true, phone: true, address: true, website: true, locale: true, orderTerms: true, warrantyDays: true } } },
  })
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Bloqueio de assinatura é só de página — essa rota é despachável direto
  // via HTTP, independente da UI. (Achado em revisão de segurança
  // pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(dbUser.tenantId)

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

  // Fotos embutidas como data URI: o @react-pdf busca URL de verdade durante
  // a renderização, e link assinado expira — um PDF gerado hoje ficaria com
  // buraco amanhã. Embutir resolve isso e faz o arquivo continuar completo
  // depois de baixado, que é justamente o ponto de ter foto no documento.
  //
  // Teto de 6: é o que cabe em duas fileiras sem empurrar as assinaturas pra
  // outra página, e mantém o arquivo em tamanho que se envia por WhatsApp.
  const anexos = await prisma.attachment.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
    select: { url: true },
    take: 6,
  })
  const fotos: string[] = []
  for (const a of anexos) {
    if (!caminhoPertenceAoTenant(a.url, dbUser.tenantId)) continue
    // Falha de download não derruba o PDF inteiro: a OS sai sem aquela foto.
    const conteudo = await baixarArquivo(a.url).catch(() => null)
    if (conteudo) fotos.push(`data:image/jpeg;base64,${conteudo.toString("base64")}`)
  }

  // O PDF é renderizado fora do request context do Next.js — o locale do
  // tenant precisa ser passado explícito. (Item 1 do roadmap, 06/08/2026.)
  // Garantia: prazo da OS, ou o padrao da empresa. Vira texto aqui porque o
  // componente do PDF nao deve fazer conta de data nem saber de traducao.
  const dias = diasDeGarantia(order.warrantyDays, dbUser.tenant.warrantyDays)
  const venceEm = garantiaAte(order.concludedAt, dias)

  const locale = dbUser.tenant.locale
  const t = getTranslator(locale, "pdf")

  const buildElement = (logoUrl: string | null) => {
    return React.createElement(ServiceOrderPDF, {
      order,
      companyName: dbUser.tenant.name,
      logoUrl,
      companyPhone: dbUser.tenant.phone,
      companyAddress: dbUser.tenant.address,
      companyWebsite: dbUser.tenant.website,
      locale,
      termos: dbUser.tenant.orderTerms,
      garantia:
        dias === null || dias <= 0
          ? null
          : prazoPorExtenso(dias, (c, v) => t(c as "garantia.dias", v)) +
            (venceEm ? ` — ${t("serviceOrder.warrantyUntil", { data: formatDate(venceEm) })}` : ""),
      fotos,
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
    console.error("Falha ao gerar PDF de OS com logo, tentando sem logo:", err)
    try {
      buffer = await renderToBuffer(buildElement(null))
    } catch (err2) {
      console.error("Falha ao gerar PDF de OS mesmo sem logo:", err2)
      return NextResponse.json({ error: t("errors.generateFailed") }, { status: 500 })
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // Header HTTP é ASCII — os valores de fileNamePrefix são sem acento.
      "Content-Disposition": `inline; filename="${t("serviceOrder.fileNamePrefix")}-${order.number}.pdf"`,
    },
  })
}
