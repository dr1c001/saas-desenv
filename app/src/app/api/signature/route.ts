import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { orderId, clientToken, signature } = await req.json()

    if (!signature?.startsWith("data:image/")) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 400 })
    }

    // Duas origens possíveis: o portal público (/p/[token]), sem sessão —
    // autentica via clientToken, igual /api/nps e /api/quote-approval; ou o
    // uso interno (staff logado assinando pelo cliente) — autentica via
    // sessão/tenantId, como antes. Antes disso, o portal público sempre
    // chamava getTenant() sem sessão, que lança redirect("/login") — o catch
    // genérico engolia isso e devolvia um 500 com "NEXT_REDIRECT" como
    // mensagem de erro pro cliente. Nenhum cliente jamais conseguia assinar
    // pelo portal. (Achado verificando o sistema antes da primeira venda,
    // 2026-07-28.)
    const order = clientToken
      ? await prisma.serviceOrder.findUnique({ where: { id: orderId, clientToken } })
      : await getTenant().then(async ({ tenantId }) => {
          // Uso interno (staff logado) é feature paga — bloqueio de página
          // não protege rota despachável direto. O ramo público (clientToken)
          // acima não passa por aqui: bloquear o cliente de confirmar um
          // serviço por causa da assinatura do prestador seria punir o lado
          // errado. (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
          await requireActiveSubscription(tenantId)
          return prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId } })
        })
    if (!order) return NextResponse.json({ ok: false, error: "OS não encontrada" }, { status: 404 })

    await prisma.serviceOrder.update({
      where: { id: orderId },
      data: { clientSignatureUrl: signature },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
