import { after, NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { avisarPlataforma } from "@/lib/avisar-plataforma"
import { asaas } from "@/lib/asaas"
import { confirmarPagamento } from "@/lib/confirmar-pagamento"
import { decidirEstorno, ehContestacao, ehEstorno, idDaAssinaturaNoEvento } from "@/lib/estorno"

export async function POST(req: NextRequest) {
  // Asaas ecoa o token configurado no dashboard (Integrações → Webhooks) no
  // header "asaas-access-token" em toda chamada — sem isso, qualquer um podia
  // forjar eventos de pagamento (ex: ativar a própria assinatura sem pagar,
  // ou cancelar a de outro tenant). (Achado em revisão de segurança 2026-07-19.)
  const token = req.headers.get("asaas-access-token")
  if (!process.env.ASAAS_WEBHOOK_SECRET || token !== process.env.ASAAS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let event: unknown = undefined
  let asaasSubId: string | null = null
  try {
    const body = await req.json()
    event = body?.event
    const payment = body?.payment

    // Evento de pagamento traz `payment.subscription`; evento de ASSINATURA
    // (SUBSCRIPTION_DELETED) traz `subscription.id` e não tem `payment`. Lendo
    // só o primeiro, o handler desistia aqui e o ramo de cancelamento lá
    // embaixo era inalcançável. (Achado na auditoria de 13/09/2026.)
    asaasSubId = idDaAssinaturaNoEvento(body ?? {})
    if (!asaasSubId) return NextResponse.json({ ok: true })

    const sub = await prisma.subscription.findFirst({
      where: { asaasId: asaasSubId },
      select: {
        id: true,
        tenantId: true,
        asaasId: true,
        status: true,
        currentPeriodEnd: true,
        lastProcessedPaymentId: true,
        plan: { select: { name: true } },
        tenant: { select: { name: true } },
      },
    })
    if (!sub) return NextResponse.json({ ok: true })

    // ── Pagamento confirmado ─────────────────────────────────────────────────
    // A regra inteira — reivindicar + ativar numa escrita só, push, preço cheio
    // depois do desconto de indicação, bônus a quem indicou, contrato no e-mail
    // — mora em lib/confirmar-pagamento.ts, e é a MESMA que a reconciliação
    // diária do cron usa. Aqui só o despacho.
    //
    // O Asaas manda PAYMENT_CONFIRMED (autorização) e depois PAYMENT_RECEIVED
    // (liquidação) para o MESMO pagamento em cartão; a segunda chegada volta
    // "repetida" e não soma um segundo ciclo (achado de 03/08/2026).
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const paymentId: string | undefined = payment?.id
      if (paymentId) {
        const r = await confirmarPagamento({ subscriptionId: sub.id, paymentId })
        // O e-mail com o contrato DEPOIS da resposta: o webhook precisa
        // responder rápido, e em runtime serverless a instância pode congelar
        // assim que o handler retorna — after() é como se diz "só depois disto".
        // (Achado em auditoria, 20/08/2026.)
        after(r.pendente)
      } else {
        console.error("[webhook asaas] pagamento confirmado sem id:", asaasSubId, event)
      }
    }

    // PAYMENT_OVERDUE/SUBSCRIPTION_DELETED só rebaixam o tenant se essa
    // assinatura chegou a estar ACTIVE de verdade. Uma assinatura PENDING
    // abandonada (nunca paga) que o Asaas cancela por vencimento não deve
    // derrubar um tenant que ainda está em trial válido — ele nunca ganhou
    // acesso por causa dela, então não há nada a revogar no tenant.
    if (event === "PAYMENT_OVERDUE" && sub.status === "ACTIVE") {
      // `updateMany` condicionado ao status, e não `update` por id puro.
      //
      // O `sub` acima veio de um findFirst no TOPO do handler. O Asaas reenvia
      // o mesmo evento, e duas entregas quase simultâneas leem as duas
      // `status === "ACTIVE"` e ambas passam pelo `if` — a guarda lá em cima
      // não é atômica. Com a condição dentro do WHERE, o banco decide quem
      // ganhou: `count` é 1 para uma só, e é ele que autoriza o aviso.
      const [mudou] = await prisma.$transaction([
        prisma.subscription.updateMany({
          where: { id: sub.id, status: "ACTIVE" },
          data: { status: "PAST_DUE" },
        }),
        // O do tenant fica incondicional de propósito: é idempotente, e
        // gravar PAST_DUE duas vezes não muda nada.
        prisma.tenant.update({ where: { id: sub.tenantId }, data: { subscriptionStatus: "PAST_DUE" } }),
      ])

      if (mudou.count === 1) {
        after(
          avisarPlataforma("assinaturaEmAtraso", {
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            fimDoPeriodo: sub.currentPeriodEnd,
            empresa: sub.tenant.name,
            plano: sub.plan?.name ?? null,
          })
        )
      }
    }

    if (event === "SUBSCRIPTION_DELETED") {
      if (sub.status === "ACTIVE") {
        // Mesma trava do atraso: quem move o status de ACTIVE é uma só.
        const [mudou] = await prisma.$transaction([
          prisma.subscription.updateMany({
            where: { id: sub.id, status: "ACTIVE" },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          }),
          // O PLANO fica — mesma regra de cancelSubscription em actions/billing.ts:
          // o cancelamento honra o período já pago, e sem plano a empresa cairia
          // no PERMISSIVO, recebendo mais do que comprou. Quem decide o acesso é
          // o status mais `currentPeriodEnd`.
          prisma.tenant.update({
            where: { id: sub.tenantId },
            data: { subscriptionStatus: "CANCELLED" },
          }),
        ])

        // Cliente PERDIDO é fato diferente de cliente atrasado, e por isso tem
        // aviso e chave próprios. Com uma chave só por empresa, este aqui —
        // que chega DEPOIS do atraso — encontraria a linha já gravada e seria
        // engolido: o dono saberia que o cliente atrasou e nunca que ele foi
        // embora, que é a metade que importa.
        if (mudou.count === 1) {
          after(
            avisarPlataforma("assinaturaCancelada", {
              tenantId: sub.tenantId,
              subscriptionId: sub.id,
              empresa: sub.tenant.name,
              plano: sub.plan?.name ?? null,
            })
          )
        }
      } else {
        await prisma.subscription.updateMany({
          where: { id: sub.id, status: { not: "CANCELLED" } },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        })
      }
    }

    // ── Estorno e chargeback ─────────────────────────────────────────────────
    // O dinheiro voltou ao cliente. Regra em lib/estorno.ts: só o pagamento
    // que COMPROU o período corrente revoga o acesso; outro pagamento só avisa.
    if (ehEstorno(event)) {
      const pagamentoId: string | undefined = payment?.id
      const decisao = decidirEstorno(sub, pagamentoId)
      if (decisao === "ignorar") {
        console.error("[webhook asaas] estorno sem id de pagamento:", asaasSubId, event)
      } else {
        const agora = new Date()
        let cortou = false
        if (decisao === "revogar") {
          // `currentPeriodEnd: agora` é o que corta de fato — CANCELLED sozinho
          // honra o período (lib/auth.ts), e aqui o período NÃO foi pago.
          // Condicionado ao pagamento: reenvio da Asaas e chargeback + estorno
          // do mesmo pagamento revogam UMA vez.
          const [mudou] = await prisma.$transaction([
            prisma.subscription.updateMany({
              where: {
                id: sub.id,
                lastProcessedPaymentId: pagamentoId,
                OR: [{ status: { not: "CANCELLED" } }, { currentPeriodEnd: { gt: agora } }],
              },
              data: { status: "CANCELLED", cancelledAt: agora, currentPeriodEnd: agora },
            }),
            // Só quando ESTA assinatura era a viva do tenant. Se ela já estava
            // CANCELLED (o cliente cancelou e ainda estava no período pago) o
            // tenant pode ter outra assinatura nova — não se mexe nele.
            ...(sub.status !== "CANCELLED"
              ? [prisma.tenant.update({ where: { id: sub.tenantId }, data: { subscriptionStatus: "CANCELLED" } })]
              : []),
          ])
          cortou = mudou.count === 1
          // Encerra a cobrança recorrente: uma Subscription CANCELLED ignora
          // pagamentos futuros, então deixar a Asaas cobrando seria cobrar sem
          // entregar nada — e, em chargeback, provocar outro chargeback com
          // taxa. Melhor esforço, depois da resposta.
          if (cortou && sub.asaasId) {
            after(
              asaas
                .cancelSubscription(sub.asaasId)
                .catch((e) => console.error("[webhook asaas] falha ao encerrar a cobrança após estorno:", sub.asaasId, e))
            )
          }
        }
        if (decisao === "avisar" || cortou) {
          after(
            avisarPlataforma("pagamentoEstornado", {
              tenantId: sub.tenantId,
              subscriptionId: sub.id,
              pagamentoId,
              empresa: sub.tenant.name,
              plano: sub.plan?.name ?? null,
              valor: typeof payment?.value === "number" ? payment.value : null,
              contestacao: ehContestacao(event),
              acessoCortado: cortou,
            })
          )
        }
      }
    }
  } catch (err) {
    // Responde 200 de propósito: 5xx faz a Asaas reenviar, e falhas repetidas
    // põem a fila de webhooks em "interrupted" — foi o incidente de 07/08/2026.
    // Mas NUNCA em silêncio: até 15/09/2026 este catch era vazio, e uma falha
    // no processamento de pagamento não deixava uma linha em lugar nenhum.
    // (Achado na auditoria de 13/09/2026.)
    console.error("[webhook asaas] falhou (respondendo 200 de propósito):", { event, asaasSubId }, err)
  }

  return NextResponse.json({ ok: true })
}
