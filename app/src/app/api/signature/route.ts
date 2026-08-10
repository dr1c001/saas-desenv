import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getTranslations } from "next-intl/server"
import { getTranslator } from "@/lib/i18n"

export async function POST(req: NextRequest) {
  try {
    const { orderId, clientToken, signature } = await req.json()

    // Dois caminhos, dois idiomas possíveis: o portal público (cliente final)
    // não tem sessão, então o locale sai do tenant dono da OS; o uso interno
    // (staff logado) usa o request context normal. Como a OS só é carregada
    // depois, resolve-se o tradutor após saber de qual ramo veio. (i18n.)
    if (!signature?.startsWith("data:image/")) {
      const te = await getTranslations("errors")
      return NextResponse.json({ ok: false, error: te("invalidSignature") }, { status: 400 })
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
    const include = { tenant: { select: { locale: true } } } as const
    const order = clientToken
      ? await prisma.serviceOrder.findUnique({ where: { id: orderId, clientToken }, include })
      : await getTenant().then(async ({ tenantId }) => {
          // Uso interno (staff logado) é feature paga — bloqueio de página
          // não protege rota despachável direto. O ramo público (clientToken)
          // acima não passa por aqui: bloquear o cliente de confirmar um
          // serviço por causa da assinatura do prestador seria punir o lado
          // errado. (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
          await requireActiveSubscription(tenantId)
          return prisma.serviceOrder.findUnique({ where: { id: orderId, tenantId }, include })
        })
    if (!order) {
      const te = await getTranslations("errors")
      return NextResponse.json({ ok: false, error: te("orderNotFound") }, { status: 404 })
    }
    // A partir daqui o idioma sai do tenant dono da OS — cobre o ramo público,
    // onde não há sessão pro request context resolver nada. (i18n.)
    const t = getTranslator(order.tenant.locale, "errors")

    // "Assinatura digital" é vendida no plano Pro. Vale para os DOIS ramos, e
    // isso é diferente do bloqueio por assinatura vencida logo acima: lá, o
    // cliente final não pode ser punido por um pagamento atrasado da empresa
    // no meio de um serviço; aqui, a empresa nunca comprou o recurso, então
    // ele não deveria nem ter sido oferecido ao cliente dela.
    if (!(await temRecurso(order.tenantId, "signature"))) {
      return NextResponse.json({ ok: false, error: t("planFeature.signature") }, { status: 403 })
    }
    // Nada impedia assinar uma OS cancelada — a assinatura confirma execução
    // de um serviço que oficialmente não aconteceu. (Achado verificando o
    // sistema antes da primeira venda, 2026-08-03.)
    if (order.status === "CANCELLED") {
      return NextResponse.json({ ok: false, error: t("cancelledOrderCannotSign") }, { status: 400 })
    }
    // Mesmo motivo do bloqueio de edição em completeServiceOrder/
    // updateServiceOrder: uma OS já faturada tem NFS-e/recibo vinculados —
    // trocar a assinatura depois quebraria essa consistência. (Achado em
    // auditoria pré-venda, 2026-08-05.)
    if (order.status === "INVOICED" && order.clientSignatureUrl) {
      return NextResponse.json({ ok: false, error: t("invoicedSignatureLocked") }, { status: 400 })
    }

    await prisma.serviceOrder.update({
      where: { id: orderId },
      data: { clientSignatureUrl: signature },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
