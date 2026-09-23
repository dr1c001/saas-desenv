"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, podeAba } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { clientIp } from "@/lib/rate-limit"
import { VERSAO_CONTRATO } from "@/components/pdf/contrato-pdf"
import { ehRecusaCerta } from "@/lib/tempo-limite"
import { asaas } from "@/lib/asaas"
import { getTranslations } from "next-intl/server"
import { precoCheio, precoCobrado } from "@/lib/preco"
import { decidirTroca } from "@/lib/troca-de-plano"

export async function getBillingStatus() {
  const { tenantId } = await getTenant()

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      referralDiscountPercent: true,
      customPriceMonthly: true,
      plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceYearly: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          billingCycle: true,
          currentPeriodEnd: true,
          // A troca de plano AGENDADA (downgrade): a tela precisa mostrar para
          // onde a assinatura vai e quando, e oferecer desfazer.
          pendingPlanId: true,
          pendingPlan: { select: { id: true, name: true } },
        },
      },
    },
  })

  return tenant
}

export async function getPlans() {
  // `select` EXPLÍCITO, e não a tabela inteira.
  //
  // `Plan.features` é texto de vitrine que nenhuma tela lê há muito tempo: a
  // lista de vantagens vem de `planFeatures` no i18n, porque ela é bilíngue e a
  // coluna é de um idioma só. Ela viajava do banco até aqui a cada abertura da
  // tela de assinatura para ser descartada — e, pior, divergia em silêncio do
  // que a vitrine promete (o seed dizia "Suporte 24h" onde a tela diz
  // "Atendimento por WhatsApp em horário comercial").
  //
  // Parar de PEDIR a coluna vem antes de apagá-la: enquanto o código no ar
  // ainda a seleciona, derrubar a coluna faria a tela de assinatura responder
  // 500 durante a janela entre o `migrate deploy` e o build novo entrar. A
  // remoção da coluna é o passo seguinte, num deploy próprio.
  // (Achado na auditoria de 13/09/2026, grupo 9.)
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceMonthly: "asc" },
    select: {
      id: true, slug: true, name: true,
      priceMonthly: true, priceYearly: true, maxUsers: true,
    },
  })
}

export async function subscribeToPlan(formData: FormData) {
  const { tenantId, userId } = await getTenant()
  const tb = await getTranslations("billingReferral")
  const tc = await getTranslations("common")
  // Quem mexe na cobrança é quem tem a ABA "Assinatura" marcada, e não uma
  // lista de cargos escrita aqui.
  //
  // A tela de Permissões oferecia a aba para marcar, e marcá-la não fazia
  // nada: o menu aparecia e os botões voltavam em silêncio. Mesmo "menu
  // promete, tela expulsa" que o Grupo 3 fechou em Financeiro, Relatórios,
  // Contratos e Mapa. Dono e administrador continuam passando sempre —
  // `getAllowedTabs` devolve todas as abas para eles.
  // (Decisão do dono da plataforma, 22/09/2026.)
  if (!(await podeAba("billing"))) {
    redirect("/billing?error=" + encodeURIComponent(tc("noPermission")))
  }

  // Sem isso, duplo clique/retry de rede cria duas Subscriptions reais na
  // Asaas (duas cobranças recorrentes paralelas) — nada impedia reenviar o
  // form. Também cobre reassinar enquanto já tem uma em andamento (troca
  // de plano não é suportada ainda — ver o verbete 3.5 do manual).
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  //
  // PAST_DUE entrou em 22/09/2026, e faltava: a lista era ["PENDING","ACTIVE"]
  // enquanto a irmã em `cancelSubscription` usa os TRÊS — com a justificativa
  // escrita de que "nos três estados a assinatura na Asaas CONTINUA FATURANDO
  // todo ciclo". Ou seja: o cliente cujo boleto venceu clicava em Assinar e
  // criava uma SEGUNDA cobrança recorrente no mesmo cartão, com a primeira
  // ainda faturando — exatamente a duplicidade que esta guarda existe para
  // impedir. Quem está em atraso precisa PAGAR a fatura aberta, não assinar de
  // novo. (Achado investigando o verbete 3.5 do manual, 22/09/2026.)
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ["PENDING", "ACTIVE", "PAST_DUE"] } },
  })
  if (existingSub) {
    const motivo =
      existingSub.status === "PENDING"
        ? "errors.subscriptionPending"
        : existingSub.status === "PAST_DUE"
          ? "errors.subscriptionPastDue"
          : "errors.subscriptionActive"
    redirect("/billing?error=" + encodeURIComponent(tb(motivo as "errors.subscriptionActive")))
  }

  const planId = formData.get("planId") as string
  const cycle = (formData.get("cycle") as "MONTHLY" | "YEARLY") ?? "MONTHLY"

  try {
    const [plan, tenant] = await Promise.all([
      // select explícito: ver o comentário em getPlans sobre Plan.features.
      prisma.plan.findUnique({
        where: { id: planId },
        select: { id: true, slug: true, name: true, priceMonthly: true, priceYearly: true },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { users: { where: { role: "OWNER" }, take: 1 } },
      }),
    ])

    if (!plan || !tenant) {
      redirect("/billing?error=" + encodeURIComponent(tb("errors.planNotFound")))
    }

    const owner = tenant.users[0]
    if (!owner) {
      redirect("/billing?error=" + encodeURIComponent(tb("errors.ownerNotFound")))
    }
    if (!tenant.document) {
      redirect(
        "/billing?error=" +
          encodeURIComponent(tb("errors.missingDocument"))
      )
    }
    // Desconto de indicação (creditado por quem indicou/foi indicado — ver
    // lib/auth.ts e api/webhooks/asaas) aplicado uma vez, no primeiro pagamento
    // desta assinatura, e consumido logo abaixo.
    const discountPercent = tenant.referralDiscountPercent

    // A conta mora em lib/preco.ts, testada lá. Aqui só o efeito.
    //
    // `customPriceMonthly` é a mensalidade combinada com ESTA empresa. Ela
    // existia desde 22/08/2026 e NÃO era usada: o painel gravava o valor, a
    // auditoria registrava, e a cobrança continuava saindo pelo preço do plano
    // — liberar recursos e ajustar tetos para alguém e continuar cobrando a
    // tabela é dar o combinado de graça.
    const price = precoCobrado(
      { priceMonthly: Number(plan.priceMonthly), priceYearly: Number(plan.priceYearly) },
      tenant.customPriceMonthly === null ? null : Number(tenant.customPriceMonthly),
      cycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      discountPercent
    )

    // Create or reuse Asaas customer
    let asaasCustomerId = tenant.asaasCustomerId
    if (!asaasCustomerId) {
      const customer = await asaas.createCustomer({
        name: tenant.name,
        email: owner?.email ?? "",
        cpfCnpj: tenant.document,
      })
      asaasCustomerId = customer.id
      await prisma.tenant.update({ where: { id: tenantId }, data: { asaasCustomerId } })
    } else {
      // Cliente ja existia (ex: tentativa anterior que falhou so na assinatura) —
      // garante que o CPF/CNPJ esta no cadastro do Asaas, exigido pelo billingType UNDEFINED.
      await asaas.updateCustomer(asaasCustomerId, { cpfCnpj: tenant.document })
    }

    // Next due date = today
    const nextDueDate = new Date().toISOString().split("T")[0]

    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + (cycle === "YEARLY" ? 12 : 1))

    // ─── A linha local nasce ANTES da chamada à Asaas ───────────────────────
    //
    // A ordem antiga era: cria a assinatura recorrente REAL na Asaas, e só
    // depois grava no banco. Entre as duas não havia nada — nem registro de
    // intenção, nem compensação —, e `asaasRequest` não tem timeout.
    //
    // O estrago: a Asaas cria a cobrança mensal, o `$transaction` falha (banco
    // em failover, pool esgotado) ou a função morre por tempo, e o catch manda
    // o dono de volta para /billing com um erro. A guarda de duplicidade lá em
    // cima procura Subscription no NOSSO banco e não acha nada, porque nada foi
    // gravado. Ele clica de novo: SEGUNDA assinatura recorrente no mesmo
    // cartão. Duas cobranças mensais paralelas, e o sistema só conhece a
    // segunda — a primeira cobra para sempre e ninguém consegue nem vê-la nem
    // cancelá-la pela tela.
    //
    // Agora a linha é criada antes, sem `asaasId`. Se a Asaas falhar, ela é
    // apagada e o dono pode tentar de novo; se a gravação do `asaasId` falhar
    // depois, a linha fica lá e a guarda de duplicidade ENXERGA a tentativa —
    // que é exatamente o que faltava. (Auditoria de 13/09/2026.)
    // ─── O REGISTRO DO ACEITE ─────────────────────────────────────────────
    //
    // O quadro de fecho do contrato afirma que ficam registrados "o endereço
    // IP, a data, a hora e a identificação da CONTRATANTE" para comprovação de
    // autoria e integridade. Até 22/09/2026 nada disso era gravado em lugar
    // nenhum: o documento que deveria sustentar a defesa era o que a desmentia.
    //
    // Gravado AQUI, no clique de contratar, porque é este o ato de vontade —
    // a confirmação do pagamento vem depois, por webhook da Asaas, de onde não
    // há IP de cliente nenhum para registrar.
    //
    // A VERSÃO também: `gerarContrato` montava o PDF sempre na versão e na
    // carência de hoje, então quem assinou a v1.1 (5 dias) baixava um
    // documento rotulado v1.2 prometendo 30.
    const local = await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: "PENDING",
        billingCycle: cycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        contractVersion: VERSAO_CONTRATO,
        acceptedAt: new Date(),
        // Melhor esforço: não conseguir ler o IP registra menos, e registrar
        // menos é muito melhor que impedir alguém de assinar por causa de um
        // cabeçalho. `clientIp` depende do contexto da requisição.
        acceptedIp: await clientIp().catch(() => null),
        acceptedByUserId: userId,
        // O desconto que ESTA assinatura carrega, gravado na mesma escrita.
        //
        // `Tenant.referralDiscountPercent` e zerado logo abaixo, assim que a
        // assinatura nasce na Asaas — e ate aqui era o unico registro. Sem
        // esta coluna, uma falha ao devolver o preco cheio depois do primeiro
        // pagamento deixava o desconto vitalicio em silencio, sem nada no
        // sistema saber que havia devolucao pendente.
        // (Achado na auditoria de 13/09/2026, grupo 9.)
        referralDiscountPercent: discountPercent,
      },
      select: { id: true },
    })

    let sub
    try {
      sub = await asaas.createSubscription({
        customer: asaasCustomerId,
        billingType: "UNDEFINED",
        value: price,
        nextDueDate,
        cycle: cycle === "YEARLY" ? "YEARLY" : "MONTHLY",
        description: `${plan.name} — ${cycle === "YEARLY" ? "Anual" : "Mensal"}`,
      })
    } catch (e) {
      // A Asaas RESPONDEU e recusou (4xx): não há cobrança lá fora, e a linha
      // local não deve ficar bloqueando uma nova tentativa.
      //
      // Qualquer outra falha — timeout (lib/asaas.ts tem AbortSignal.timeout
      // desde 15/09/2026), socket caído depois do POST, 5xx de gateway — é
      // "não sei se a assinatura foi criada". A linha FICA: ela é o que faz a
      // guarda de duplicidade lá em cima enxergar a tentativa, e o suporte
      // resolve uma linha presa; ninguém enxerga uma segunda cobrança
      // recorrente que o sistema não conhece. (Achado na auditoria de
      // 13/09/2026.)
      if (ehRecusaCerta(e)) {
        await prisma.subscription.delete({ where: { id: local.id } }).catch(() => null)
        throw e
      }
      console.error("[assinatura] Asaas sem resposta conclusiva — linha local mantida:", local.id, e)
      throw new Error(tb("errors.providerTimeout"))
    }

    // Fica PENDING até o webhook do Asaas confirmar o pagamento (evento
    // PAYMENT_RECEIVED/PAYMENT_CONFIRMED) — nem Subscription.status nem
    // Tenant.subscriptionStatus viram ACTIVE aqui, senão qualquer um ganha
    // acesso pago só de preencher o formulário, sem pagar nada.
    // (Achado em revisão de segurança 2026-07-19.)
    // Tenant.subscriptionStatus também vira PENDING aqui — antes ficava
    // travado em TRIAL até o webhook confirmar, e /expired (que já tem uma
    // tela específica de "confirmando pagamento") nunca conseguia mostrar
    // essa tela: um cliente que voltasse pro app entre assinar e o webhook
    // confirmar via "Assine um plano" como se nunca tivesse tentado.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    await prisma.$transaction([
      prisma.subscription.update({ where: { id: local.id }, data: { asaasId: sub.id } }),
      prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "PENDING" } }),
    ])

    if (discountPercent > 0) {
      // CAS: só zera se o valor não mudou desde que lemos acima — evita tanto
      // apagar um crédito mais novo (ex: webhook creditando bônus de
      // indicação enquanto essa chamada à Asaas estava em andamento) quanto
      // duas submissões concorrentes gastarem o mesmo saldo de desconto duas
      // vezes. (Achado em revisão de segurança 2026-07-21.)
      await prisma.tenant.updateMany({
        where: { id: tenantId, referralDiscountPercent: discountPercent },
        data: { referralDiscountPercent: 0 },
      })
    }

    revalidatePath("/billing")

    // Leva o cliente direto pra pagina de pagamento hospedada pelo Asaas
    // (preenche dados + cartao la, nunca no nosso servidor). Se por algum
    // motivo a fatura ainda nao estiver disponivel, cai no fluxo antigo.
    const invoiceUrl = await asaas.getFirstInvoiceUrl(sub.id).catch((err) => {
      // A assinatura real já foi criada na Asaas nesse ponto — isso só afeta
      // o link imediato na tela (o cliente ainda recebe a fatura por
      // e-mail), mas precisa ficar visível pra debugar se acontecer de
      // verdade. (Achado verificando o sistema antes da primeira venda,
      // 2026-08-03.)
      console.error("Falha ao buscar link da fatura da assinatura", sub.id, err)
      return null
    })
    if (invoiceUrl) redirect(invoiceUrl)
  } catch (err) {
    // redirect() throws internally in Next.js — let it propagate
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    if (msg.includes("NEXT_REDIRECT")) throw err
    redirect("/billing?error=" + encodeURIComponent(msg))
  }

  redirect("/billing?success=1")
}

export async function cancelSubscription() {
  const { tenantId } = await getTenant()
  const tb = await getTranslations("billingReferral")
  // Quem mexe na cobrança é quem tem a ABA "Assinatura" marcada, e não uma
  // lista de cargos escrita aqui.
  //
  // A tela de Permissões oferecia a aba para marcar, e marcá-la não fazia
  // nada: o menu aparecia e os botões voltavam em silêncio. Mesmo "menu
  // promete, tela expulsa" que o Grupo 3 fechou em Financeiro, Relatórios,
  // Contratos e Mapa. Dono e administrador continuam passando sempre —
  // `getAllowedTabs` devolve todas as abas para eles.
  // (Decisão do dono da plataforma, 22/09/2026.)
  if (!(await podeAba("billing"))) return

  // ─── QUEM pode cancelar ──────────────────────────────────────────────────
  //
  // Era só `status: "ACTIVE"`. Mas o webhook rebaixa a assinatura para
  // PAST_DUE assim que uma cobrança falha, e ela nasce PENDING até o primeiro
  // pagamento — nos dois estados a assinatura na Asaas CONTINUA FATURANDO todo
  // ciclo. O cliente cujo boleto venceu entrava em Cobrança para cancelar,
  // como o contrato manda, e não achava o botão; chamando a Action direto, ela
  // voltava calada. O único jeito de parar era falar com o suporte — enquanto
  // a cláusula de rescisão promete cancelamento pelo próprio sistema.
  //
  // TRIAL continua de fora, e não por esquecimento: ali não existe assinatura
  // na Asaas, não há o que cancelar, e marcar o tenant como CANCELLED
  // bloquearia quem só está testando. (Achado na auditoria de 13/09/2026.)
  const sub = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
    orderBy: { createdAt: "desc" },
  })

  // Sem assinatura viva, não há nada real pra cancelar — antes disso o
  // tenant era marcado CANCELLED incondicionalmente aqui embaixo, o que
  // bloqueava até um tenant só em TRIAL. (Achado em revisão de segurança 2026-07-19.)
  if (!sub) {
    redirect("/billing?error=" + encodeURIComponent(tb("errors.nadaACancelar")))
  }

  if (sub.asaasId) {
    try {
      await asaas.cancelSubscription(sub.asaasId)
    } catch (err) {
      // Não marca como cancelado localmente se o cancelamento real no Asaas
      // falhou — senão o app mostra "cancelado" enquanto o Asaas continua
      // cobrando, sem ninguém saber. (Achado em revisão de segurança 2026-07-19.)
      console.error("Falha ao cancelar assinatura no Asaas:", err)
      redirect("/billing?error=" + encodeURIComponent(tb("errors.cancelFailed")))
    }
  }

  // `updateMany` condicionado: dois cliques quase simultâneos não gravam dois
  // cancelamentos, e o que já estiver CANCELLED não é reescrito.
  await prisma.subscription.updateMany({
    where: { id: sub.id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  // O PLANO fica.
  //
  // Zerar `planId` aqui fazia duas coisas ruins de uma vez. A primeira: durante
  // o período já pago, que o contrato garante, a empresa ficaria sem plano — e
  // sem plano `getLimites` caía no PERMISSIVO, entregando mais do que ela
  // comprou. A segunda: era o terceiro caminho que produzia o estado
  // "ACTIVE sem plano", bastando alguém clicar "Liberar acesso" depois.
  //
  // Quem decide o acesso é o STATUS mais a data em `currentPeriodEnd`, lida por
  // `hasActiveSubscription`. O plano continua descrevendo o que a empresa
  // contratou até o fim do que pagou. (Auditoria de 13/09/2026.)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "CANCELLED" },
  })

  revalidatePath("/billing")
}

/**
 * TROCAR DE PLANO, pelo painel.
 *
 * As regras — e o porquê de cada uma — estão em lib/troca-de-plano.ts. Aqui
 * mora o que fala com banco e com a Asaas.
 *
 * O `pendente` é o downgrade: ele não muda nada agora, só anota para onde a
 * assinatura vai no fim do período que o cliente já pagou. Quem aplica é
 * `aplicarTrocaAgendada`, na renovação ou no cron.
 */
export async function trocarDePlano(formData: FormData) {
  const { tenantId } = await getTenant()
  const tb = await getTranslations("billingReferral")
  // Quem mexe na cobrança é quem tem a ABA "Assinatura" marcada, e não uma
  // lista de cargos escrita aqui.
  //
  // A tela de Permissões oferecia a aba para marcar, e marcá-la não fazia
  // nada: o menu aparecia e os botões voltavam em silêncio. Mesmo "menu
  // promete, tela expulsa" que o Grupo 3 fechou em Financeiro, Relatórios,
  // Contratos e Mapa. Dono e administrador continuam passando sempre —
  // `getAllowedTabs` devolve todas as abas para eles.
  // (Decisão do dono da plataforma, 22/09/2026.)
  if (!(await podeAba("billing"))) return

  const planId = String(formData.get("planId") ?? "")

  const [sub, novo, tenant] = await Promise.all([
    prisma.subscription.findFirst({
      where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { id: true, priceMonthly: true, priceYearly: true } } },
    }),
    prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, priceMonthly: true, priceYearly: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { customPriceMonthly: true } }),
  ])

  if (!sub || !novo) {
    redirect("/billing?error=" + encodeURIComponent(tb("errors.nadaACancelar")))
  }

  const decisao = decidirTroca(
    {
      atual: {
        id: sub.plan.id,
        priceMonthly: Number(sub.plan.priceMonthly),
        priceYearly: Number(sub.plan.priceYearly),
      },
      novo: { id: novo.id, priceMonthly: Number(novo.priceMonthly), priceYearly: Number(novo.priceYearly) },
      ciclo: sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      combinado: tenant?.customPriceMonthly === null || tenant?.customPriceMonthly === undefined
        ? null
        : Number(tenant.customPriceMonthly),
    },
    sub.status
  )

  if (!decisao.ok) {
    const chave =
      decisao.motivo === "mesmoPlano" ? "errors.trocaMesmoPlano" : "errors.trocaAssinaturaNaoAtiva"
    redirect("/billing?error=" + encodeURIComponent(tb(chave as "errors.trocaMesmoPlano")))
  }

  // O valor recorrente na Asaas muda AGORA nos dois casos — inclusive no
  // downgrade, para a próxima fatura já sair pelo valor novo. O ACESSO é que
  // espera o fim do período pago. `updatePendingPayments: true`: se a fatura
  // do próximo ciclo já foi gerada, ela acompanha — é o que o cliente espera
  // de quem acabou de trocar de plano.
  if (sub.asaasId) {
    try {
      await asaas.updateSubscription(sub.asaasId, {
        value: decisao.valorNovo,
        updatePendingPayments: true,
      })
    } catch (e) {
      // Sem mexer no banco: a Asaas continua cobrando o valor antigo, e o
      // cliente continua no plano antigo. Os dois lados seguem coerentes.
      console.error("[troca de plano] a Asaas recusou:", sub.asaasId, e)
      redirect("/billing?error=" + encodeURIComponent(tb("errors.trocaFalhou")))
    }
  }

  if (decisao.valeApartirDe === "agora") {
    // SUBIR: acesso imediato. O período já pago não é recobrado — a empresa
    // ganha o resto do ciclo no plano melhor.
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: { planId: novo.id, pendingPlanId: null },
      }),
      prisma.tenant.update({ where: { id: tenantId }, data: { planId: novo.id } }),
    ])
  } else {
    // DESCER: só anota. O contrato garante o período pago, e tirar recurso no
    // meio do ciclo tiraria algo já comprado.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingPlanId: novo.id },
    })
  }

  revalidatePath("/billing")
  redirect("/billing?success=1")
}

/**
 * Desfaz um downgrade agendado, antes de ele valer.
 *
 * Existe porque a alternativa seria o cliente ter de trocar de volta — e
 * trocar de volta é um UPGRADE, que valeria na hora e mexeria na Asaas outra
 * vez por nada.
 */
export async function cancelarTrocaAgendada() {
  const { tenantId } = await getTenant()
  const tb = await getTranslations("billingReferral")
  // Quem mexe na cobrança é quem tem a ABA "Assinatura" marcada, e não uma
  // lista de cargos escrita aqui.
  //
  // A tela de Permissões oferecia a aba para marcar, e marcá-la não fazia
  // nada: o menu aparecia e os botões voltavam em silêncio. Mesmo "menu
  // promete, tela expulsa" que o Grupo 3 fechou em Financeiro, Relatórios,
  // Contratos e Mapa. Dono e administrador continuam passando sempre —
  // `getAllowedTabs` devolve todas as abas para eles.
  // (Decisão do dono da plataforma, 22/09/2026.)
  if (!(await podeAba("billing"))) return

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, pendingPlanId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { priceMonthly: true, priceYearly: true } } },
  })
  if (!sub) {
    redirect("/billing?error=" + encodeURIComponent(tb("errors.nadaACancelar")))
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { customPriceMonthly: true },
  })

  // O valor na Asaas volta ao do plano ATUAL — ele foi mudado no momento do
  // agendamento para a próxima fatura já sair menor.
  if (sub.asaasId) {
    try {
      await asaas.updateSubscription(sub.asaasId, {
        value: precoCheio(
          { priceMonthly: Number(sub.plan.priceMonthly), priceYearly: Number(sub.plan.priceYearly) },
          tenant?.customPriceMonthly === null || tenant?.customPriceMonthly === undefined
            ? null
            : Number(tenant.customPriceMonthly),
          sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY"
        ),
        updatePendingPayments: true,
      })
    } catch (e) {
      console.error("[troca de plano] a Asaas recusou o desfazer:", sub.asaasId, e)
      redirect("/billing?error=" + encodeURIComponent(tb("errors.trocaFalhou")))
    }
  }

  await prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: null } })
  revalidatePath("/billing")
  redirect("/billing?success=1")
}
