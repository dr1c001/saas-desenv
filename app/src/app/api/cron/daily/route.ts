import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendOnboardingDay3Email,
  sendNpsEmail,
  sendPastDueWarningEmail,
  avisarFalhaDoCron,
} from "@/lib/resend"
import { decidirAviso, diasDeAtraso, AVISOS_ATRASO } from "@/lib/past-due"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { provedor } from "@/lib/geocode"
import { avancarFila, geocodificarAvulso, semCoordenada } from "@/lib/geocode-fila"
import { ambiente, ehProducao } from "@/lib/ambiente"
import { gerarOsDosContratos } from "@/actions/contracts"
import { DIAS_DE_ANTECEDENCIA } from "@/lib/contrato-recorrente"
import { gravarRetratoDoMes } from "@/lib/snapshot"
import { temFuncao } from "@/lib/plan"
import { conciliarNotasPendentes } from "@/lib/nfse-conciliar"
import { conferirComissoes, resumirDivergencias } from "@/lib/comissao-conferente"
import { notificar } from "@/lib/notificar"
import { cobrarVencidas } from "@/lib/cobrar-vencidas"

// O padrão da Vercel (10-15s) não cabe reconciliação da Asaas + e-mails +
// backfill de geocodificação no mesmo processo.
export const maxDuration = 60

// Quantas assinaturas presas reconciliar por execução. Cada uma custa uma
// chamada HTTP à Asaas, e o orçamento da função inteira é maxDuration.
const MAX_RECONCILIACOES = 40
// Teto por chamada. 40 × 3s = 120s no pior caso absoluto, mas o normal é
// ~200ms cada; o timeout existe para o caso patológico, não para o comum.
const TIMEOUT_ASAAS_MS = 3000

// Mesma decodificação base64 usada em lib/asaas.ts (ver o porquê lá) — aqui a
// chave é lida direto pra não importar o módulo inteiro só por uma consulta.
const ASAAS_BASE =
  process.env.ASAAS_SANDBOX === "true"
    ? "https://sandbox.asaas.com/api/v3"
    : "https://www.asaas.com/api/v3"
const asaasKey = () => Buffer.from(process.env.ASAAS_TOKEN_B64!, "base64").toString("utf-8")

// Vercel Cron: runs every day at 09:00 BRT (12:00 UTC)
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 12 * * *" }] }

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // A Vercel só agenda cron em deploy de produção, mas a rota continua
  // acessível em qualquer deploy pra quem tiver o segredo. Este cron manda
  // e-mail de cobrança e reconcilia assinatura na Asaas — nada disso deve
  // rodar a partir de um ambiente de teste, nem por engano nem por curiosidade.
  if (!ehProducao()) {
    return NextResponse.json({ skipped: `ambiente ${ambiente()}` }, { status: 200 })
  }

  const now = new Date()
  // Registra que ESTA execucao comecou. Sem isso, um cron que morreu ha tres
  // dias e indistinguivel de um que rodou — e o estrago e invisivel: ninguem
  // recebe aviso de atraso, contrato recorrente nao gera OS.
  const execucao = await prisma.cronRun
    .create({ data: { name: "daily" }, select: { id: true } })
    .catch(() => null)

  const results = { day3: 0, nps: 0, rateLimitCleanup: 0, stuckPending: 0, reconciled: 0, geocoded: 0, avisosAtraso: 0, cobrancasEnviadas: 0, contratos: 0, certificadosVencendo: 0, notasConsultadas: 0, notasRejeitadas: 0, comissoesConferidas: 0, comissoesDivergentes: 0, comissoesForaDaJanela: 0, retrato: "", errors: 0 }

  // ── Rede de segurança: assinatura paga na Asaas mas presa em PENDING aqui ──
  // Em 07/08/2026 uma cliente pagou e ficou sem acesso por ~1 dia: os webhooks
  // da Asaas ainda apontavam pro domínio antigo (app-olive-six-67.vercel.app)
  // depois da migração pra servicoos.com.br, e a Asaas os marcou como
  // "interrupted" após as falhas. Nada no sistema percebia — o único sinal era
  // o cliente reclamando. Como PENDING bloqueia TODAS as abas (o layout do
  // dashboard manda pra /expired), a falha do webhook não parece "pagamento
  // não confirmado", parece "o sistema todo quebrou".
  //
  // Isto reconcilia direto na fonte da verdade (a Asaas) uma vez por dia, e é
  // idempotente: usa exatamente o mesmo caminho do webhook.
  try {
    // PAST_DUE entrou junto com o PENDING: o cliente inadimplente que paga é
    // reliberado pelo webhook, mas se ESSE webhook se perder ele fica bloqueado
    // sem nada perceber — mesmo defeito de 07/08, só que na renovação em vez da
    // primeira compra, e agora com a equipe inteira parada.
    // TETO. Este laço faz uma chamada HTTP por linha, e o conjunto só cresce:
    // toda assinatura PENDING abandonada fica aqui para sempre. Sem limite, o
    // primeiro bloco do cron é o que estoura os 60s — e aí NADA depois roda:
    // sem NPS, sem OS de contrato, sem aviso de inadimplência, sem retrato
    // mensal. Pior: a Vercel mata a função antes do avisarFalhaDoCron lá
    // embaixo, então a falha apaga o próprio alarme.
    //
    // O que sobra da fila entra amanhã. Reconciliação é rede de segurança do
    // webhook, não caminho principal — atrasar um dia não machuca ninguém.
    const stuck = await prisma.subscription.findMany({
      take: MAX_RECONCILIACOES,
      // Mais velhas primeiro: quem está preso há mais tempo é quem mais precisa.
      orderBy: { createdAt: "asc" },
      where: { status: { in: ["PENDING", "PAST_DUE"] }, asaasId: { not: null } },
      select: {
        id: true, asaasId: true, tenantId: true, planId: true, status: true,
        billingCycle: true, currentPeriodEnd: true, lastProcessedPaymentId: true,
      },
    })
    results.stuckPending = stuck.length
    for (const sub of stuck) {
      // AbortSignal.timeout: sem ele, uma Asaas travada segura a função até a
      // Vercel matá-la, e o dia inteiro de trabalho de fundo se perde. O padrão
      // já existia no projeto (geocode.ts:99 e :112) e não tinha sido aplicado
      // aqui. (Achado em auditoria, 20/08/2026.)
      const r = await fetch(`${ASAAS_BASE}/payments?subscription=${sub.asaasId}`, {
        headers: { access_token: asaasKey() },
        signal: AbortSignal.timeout(TIMEOUT_ASAAS_MS),
      })
      if (!r.ok) { results.errors++; continue }
      const { data } = (await r.json()) as { data?: { id: string; status: string; dueDate?: string }[] }
      const quitados = (data ?? []).filter((p) => p.status === "RECEIVED" || p.status === "CONFIRMED")

      // A regra muda conforme o estado, e isso importa muito:
      //
      // PENDING nunca pagou nada — qualquer pagamento liquidado serve.
      //
      // PAST_DUE já pagou ciclos ANTERIORES. Aceitar "qualquer pagamento
      // liquidado" aqui reativaria de graça quem parou de pagar, porque os
      // pagamentos antigos continuam RECEIVED pra sempre na Asaas. Só vale um
      // pagamento ainda não processado E com vencimento a partir do ciclo que
      // venceu (1 dia de folga pra arredondamento de fuso).
      const paid =
        sub.status === "PENDING"
          ? quitados[0]
          : quitados.find(
              (p) =>
                p.id !== sub.lastProcessedPaymentId &&
                p.dueDate &&
                new Date(p.dueDate).getTime() >= sub.currentPeriodEnd.getTime() - 86_400_000
            )
      if (!paid) continue

      // Renovação estende o período; primeira confirmação não — mesmo cálculo
      // do webhook (ver api/webhooks/asaas/route.ts), que não pode divergir
      // deste sob pena de dar ou tirar um ciclo de acesso de graça.
      const periodEnd = new Date(sub.currentPeriodEnd)
      if (sub.status === "PAST_DUE") {
        periodEnd.setMonth(periodEnd.getMonth() + (sub.billingCycle === "YEARLY" ? 12 : 1))
      }

      console.error(
        `[reconciliacao] assinatura ${sub.asaasId} paga na Asaas (${paid.id}) mas ${sub.status} aqui — ` +
          `webhook provavelmente nao chegou. Reativando tenant ${sub.tenantId}.`
      )
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "ACTIVE", lastProcessedPaymentId: paid.id, currentPeriodEnd: periodEnd, pastDueWarningsSent: 0 },
        }),
        prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { subscriptionStatus: "ACTIVE", planId: sub.planId },
        }),
      ])
      results.reconciled++
    }
  } catch (err) {
    console.error("[reconciliacao] falhou:", err)
    results.errors++
  }

  // ── Limpeza de rate limit expirado (janelas de no máximo 60min — qualquer
  // linha com mais de 24h já não afeta nenhuma checagem) ──────────────────────
  try {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const deleted = await prisma.authRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } })
    results.rateLimitCleanup = deleted.count
  } catch { results.errors++ }

  // ── Lembrete no dia 3 pra quem se cadastrou e ainda não assinou ──────────────
  // new Date() + setHours(0,0,0,0) zera pra meia-noite UTC (horário do
  // servidor), não meia-noite de Brasília — um tenant criado à noite (BRT)
  // podia cair no dia UTC seguinte e nunca bater exatamente com essa janela,
  // recebendo o lembrete um dia adiantado/atrasado. Mesmo padrão BRT-aware já
  // usado em dashboard.ts/finance.ts/reports.ts. (Achado em auditoria
  // pré-venda, 2026-08-05.)
  const { year, month, day } = todayInBRT()
  const day3Start = brtMidnightUTC(year, month, day - 3)
  const day3End = brtMidnightUTC(year, month, day - 2)

  // A CONSULTA também dentro do try. Sete das nove etapas do cron já estavam
  // isoladas; estas duas não, e eram justamente as menos importantes — um erro
  // no e-mail de acompanhamento derrubava a cobrança que vem depois (aviso de
  // inadimplência, OS de contrato, retrato mensal) e pulava o registro de
  // saúde no fim. (Achado em auditoria, 20/08/2026.)
  try {
    const day3Tenants = await prisma.tenant.findMany({
      where: { createdAt: { gte: day3Start, lt: day3End }, subscriptionStatus: "TRIAL" },
      include: { users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } } },
    })
    for (const t of day3Tenants) {
      const owner = t.users[0]
      if (!owner?.email) continue
      try {
        await sendOnboardingDay3Email(owner.email, owner.name, t.locale)
        results.day3++
      } catch { results.errors++ }
    }
  } catch (e) {
    console.error("[cron] lembrete de acompanhamento falhou:", e)
    results.errors++
  }

  // ── NPS: OS concluída há 7+ dias, nunca contatada ────────────────────────────
  // Três correções juntas aqui (achado verificando o cron de NPS, 2026-07-28):
  // 1. status só considerava "DONE" — completeServiceOrder com
  //    invoiceImmediately=true vai direto pra "INVOICED" sem nunca passar por
  //    "DONE" (concludedAt é setado nos dois casos). Na prática, a maioria
  //    das OS concluídas em produção está em "INVOICED" e nunca era pega.
  // 2. concludedAt exigia bater EXATAMENTE 7 dias atrás — se o cron não
  //    rodasse naquele dia exato (ou clientToken estivesse nulo, como estava
  //    até a correção anterior), a OS ficava pra sempre sem chance de NPS.
  //    Agora pega qualquer OS com 7+ dias ainda não contatada, cobrindo
  //    atrasados.
  // 3. usava npsScore como trava de "já processado" — só é setado quando o
  //    cliente responde, então quem ignora o e-mail (a própria mensagem diz
  //    "se preferir não responder, ignore") receberia um e-mail novo por dia,
  //    pra sempre. npsSentAt marca a tentativa, independente da resposta.
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Mesmo motivo do bloco acima: a CONSULTA também dentro do try, senão um
  // erro aqui derruba a cobrança e o retrato mensal que vêm depois.
  try {
    const npsOrders = await prisma.serviceOrder.findMany({
      where: {
        status: { in: ["DONE", "INVOICED"] },
        concludedAt: { lte: sevenDaysAgo },
        npsSentAt: null,
        npsScore: null,
        clientToken: { not: null },
      },
      include: {
        client: { select: { email: true, name: true } },
        // A pesquisa vai pro cliente final, mas quem "fala" é a empresa: sai no
        // idioma dela (Tenant.locale), igual à OS e ao PDF. (i18n, item 1.)
        tenant: { select: { id: true, locale: true } },
      },
      take: 100,
    })
    for (const os of npsOrders) {
      if (!os.client.email || !os.clientToken) continue
      // A pesquisa fala com o cliente FINAL da empresa. Quem desligou não quer
      // que a gente escreva para a base dela.
      if (!(await temFuncao(os.tenant.id, "nps"))) continue
      try {
        await sendNpsEmail(os.client.email, os.client.name, os.clientToken, os.tenant.locale)
        await prisma.serviceOrder.update({ where: { id: os.id }, data: { npsSentAt: new Date() } })
        results.nps++
      } catch { results.errors++ }
    }
  } catch (e) {
    console.error("[cron] pesquisa de satisfação falhou:", e)
    results.errors++
  }

  // ── Contratos recorrentes: gera a OS da próxima visita ───────────────────────
  // Com antecedência (ver lib/contrato-recorrente.ts): OS que nasce no dia da
  // visita chega tarde demais pra encaixar na rota e avisar o cliente.
  //
  // A geração é idempotente — se este cron rodar duas vezes no mesmo dia, a
  // segunda não duplica OS. É o que permite reprocessar sem medo.
  try {
    const limiteContratos = new Date(now)
    limiteContratos.setUTCDate(limiteContratos.getUTCDate() + DIAS_DE_ANTECEDENCIA)
    results.contratos = await gerarOsDosContratos(now, limiteContratos)

  // ── Certificado digital perto de vencer ───────────────────────────────────
  //
  // Certificado vencido para de emitir NOTA, e sem aviso ninguém descobre até
  // precisar faturar — que é sempre a pior hora. Avisa aos 30 e aos 7 dias.
  try {
    const emBreve = new Date(now.getTime() + 30 * 86_400_000)
    const vencendo = await prisma.fiscalCertificate.findMany({
      where: { validoAte: { not: null, lte: emBreve } },
      select: { tenantId: true, validoAte: true },
    })
    for (const c of vencendo) {
      const dias = Math.ceil((c.validoAte!.getTime() - now.getTime()) / 86_400_000)
      // Dois marcos, e não todo dia: aviso diário sobre a mesma coisa vira
      // paisagem, e no dia em que importar ninguém olha.
      if (dias !== 30 && dias !== 7 && dias !== 0) continue
      await notificar({
        tenantId: c.tenantId,
        evento: "certificadoVencendo",
        // O título vem do catálogo de notificações; aqui só o detalhe.
        corpo: dias > 0 ? `${dias} dia(s)` : "vencido",
        url: "/settings/fiscal",
        referencia: c.tenantId,
      })
      results.certificadosVencendo++
    }
  } catch (e) {
    console.error("[cron] aviso de certificado falhou:", e)
    results.errors++
  }

  // ── Notas fiscais: perguntar o que a prefeitura decidiu ────────────────────
  //
  // A metade que faltava da emissão. Emitir é assíncrono: o estado devolvido na
  // hora é quase sempre "processando", e até 22/08/2026 ninguém perguntava
  // depois. O link do PDF ficava nulo, o status congelava, e a OS era marcada
  // como faturada MESMO SE A PREFEITURA REJEITASSE — sem ninguém saber.
  //
  // Em try próprio, como as outras etapas: falha aqui não derruba o retrato
  // mensal nem o aviso de cobrança que vêm depois.
  try {
    const notas = await conciliarNotasPendentes()
    results.notasConsultadas = notas.consultadas
    results.notasRejeitadas = notas.rejeitadas
    results.errors += notas.erros
  } catch (e) {
    console.error("[cron] conciliação de notas fiscais falhou:", e)
    results.errors++
  }

  // ── Conferente das comissões ────────────────────────────────────────────────
  //
  // A comissão é mantida por um reconciliador chamado de cinco pontos. O
  // problema não é nenhum dos cinco: é o SEXTO caminho, que ainda não existe.
  // E o reconciliador engole erro de propósito, para não impedir o técnico de
  // fechar a OS na rua — então uma falha some no log.
  //
  // A assimetria que torna isto necessário: comissão FALTANDO alguém reclama
  // (o técnico cobra no dia 5); comissão ERRADA ninguém nota, porque os dois
  // números são plausíveis.
  //
  // Ele AVISA e não corrige. Corrigir sozinho reescreveria um número que a
  // pessoa já viu, e — se o reconciliador tiver defeito — espalharia o defeito
  // em silêncio em vez de revelá-lo.
  try {
    // Só as empresas com estoque/comissão em uso: varrer quem nunca digitou
    // uma porcentagem é trabalho garantido para achar nada.
    const comComissao = await prisma.tenant.findMany({
      where: { orders: { some: { commissionPct: { not: null } } } },
      select: { id: true },
    })
    for (const t of comComissao) {
      const r = await conferirComissoes(prisma, t.id, now)
      results.comissoesConferidas += r.conferidas
      if (r.divergencias.length > 0) {
        results.comissoesDivergentes += r.divergencias.length
        await notificar({
          tenantId: t.id,
          evento: "comissaoDivergente",
          corpo: resumirDivergencias(r.divergencias),
          url: "/finance",
        })
      }
      // Dito, e não escondido: o conferente olha 45 dias para trás, e o que
      // ficou fora precisa aparecer em algum lugar — senão "0 divergências"
      // passa a significar "não olhei" sem ninguém saber.
      results.comissoesForaDaJanela += r.foraDaJanela
    }
  } catch (e) {
    console.error("[cron] conferência das comissões falhou:", e)
    results.errors++
  }
  } catch (e) {
    console.error("Falha ao gerar OS de contratos recorrentes:", e)
    results.errors++
  }

  // ── Backfill de coordenadas: endereço salvo, mas sem lat/long ────────────────
  // geocodeAddress() só roda ao criar/editar o cliente e falha em silêncio.
  // Todo endereço que caiu numa dessas falhas ficou sem coordenada pra sempre,
  // e o efeito visível é a OS não aparecer no mapa — sem erro, sem aviso.
  // (Diagnosticado em 10/08/2026: das 5 primeiras contas em produção, 4
  // estavam nesse estado.) Roda por último e com orçamento de tempo curto:
  // se estourar, o que importa acima já foi gravado, e amanhã continua de onde
  // parou. Lote pequeno também respeita o limite de 1 req/s do Nominatim.
  //
  // Desde 18/08/2026 isto passa pelo LOTE quando há chave do Geoapify: um
  // envio cobre até 1.000 endereços e custa metade do crédito. Antes, um a um
  // a 1 req/s do Nominatim, a planilha de 800 clientes levava semanas — o mapa
  // ficava quebrado justamente na primeira semana de uso, que é quando a
  // empresa decide se o sistema presta.
  //
  // O lote é assíncrono: uma execução envia, a seguinte colhe. Quem o lote não
  // achou volta pela busca avulsa, que tem a cascata (rua-sem-número, cidade)
  // que o lote não faz.
  const inicioBackfill = Date.now()
  try {
    const fila = await avancarFila()
    results.geocoded += fila.gravados
    results.errors += fila.erros

    // Cascata de resgate, com o tempo que sobrou.
    if (fila.paraCascata.length > 0) {
      const resgate = await geocodificarAvulso(
        fila.paraCascata,
        Math.max(0, 25_000 - (Date.now() - inicioBackfill))
      )
      results.geocoded += resgate.gravados
      results.errors += resgate.erros
    }

    // Sem chave do Geoapify não existe lote: segue um a um, como sempre foi.
    if (provedor() === "nominatim") {
      const avulsos = await semCoordenada(10)
      const feito = await geocodificarAvulso(
        avulsos,
        Math.max(0, 25_000 - (Date.now() - inicioBackfill))
      )
      results.geocoded += feito.gravados
      results.errors += feito.erros
    }
  } catch (e) {
    console.error("Falha no backfill de coordenadas:", e)
    results.errors++
  }

  // ── Aviso de cobrança em atraso, ANTES do corte ──────────────────────────
  // Até 10/08/2026 o cliente inadimplente era bloqueado sem aviso nenhum: a
  // primeira notícia do problema era a equipe inteira parada na tela de acesso
  // expirado. Quem perde acesso sem aviso trata como defeito do sistema, não
  // como cobrança pendente — e cancela.
  //
  // Sete avisos ao longo da carencia (dias 1, 3, 10, 15, 20, 25 e 30); o
  // corte e no 30º. A regua e o corte saem da MESMA constante em lib/past-due.ts.
  try {
    const atrasadas = await prisma.subscription.findMany({
      where: { status: "PAST_DUE", pastDueWarningsSent: { lt: AVISOS_ATRASO.length } },
      select: {
        id: true,
        currentPeriodEnd: true,
        pastDueWarningsSent: true,
        tenant: {
          select: {
            name: true,
            locale: true,
            users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
          },
        },
      },
    })

    for (const sub of atrasadas) {
      // Regra em lib/past-due.ts, testada lá — aqui só o efeito colateral.
      const { enviar, total, diasRestantes, momento } = decidirAviso(
        diasDeAtraso(sub.currentPeriodEnd, now),
        sub.pastDueWarningsSent
      )
      if (!enviar) continue

      const dono = sub.tenant.users[0]

      // Marca ANTES de enviar: se o envio falhar, o cliente perde um aviso —
      // ruim, mas recuperável no marco seguinte. Marcar depois e falhar no
      // meio faria o mesmo e-mail sair todo dia até o corte, o que é pior.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { pastDueWarningsSent: total },
      })

      if (!dono?.email) continue
      try {
        await sendPastDueWarningEmail(
          dono.email,
          dono.name,
          sub.tenant.name,
          diasRestantes,
          sub.tenant.locale,
          // O tom vem da regra, e não de um número decidido no módulo de
          // e-mail: no dia 30 o texto é de BLOQUEIO, não de "faltam 0 dias".
          momento
        )
        results.avisosAtraso++
      } catch (err) {
        console.error(`[aviso de atraso] falhou para ${dono.email}:`, err)
        results.errors++
      }
    }
  } catch (err) {
    console.error("[aviso de atraso] falhou:", err)
    results.errors++
  }

  // ── Régua de cobrança das contas a receber das empresas ──────────────────
  // Lembra o cliente antes de vencer e cobra depois de vencido, sozinho. Só
  // para quem LIGOU: manda mensagem de cobrança, em nome da empresa, para o
  // celular de terceiros.
  //
  // A regra (quantos degraus, qual tom, quando calar) está em
  // lib/regua-cobranca.ts, pura e testada. O efeito colateral está em
  // lib/cobrar-vencidas.ts, que nunca lança — os erros voltam contados para
  // somarem ao total desta execução.
  try {
    const regua = await cobrarVencidas(now)
    results.cobrancasEnviadas = regua.enviadas
    results.errors += regua.erros
  } catch (err) {
    console.error("[régua de cobrança] falhou:", err)
    results.errors++
  }

  // ── Retrato mensal do negócio ────────────────────────────────────────────
  // Sempre a mesma linha do mês corrente: meses passados congelam com o último
  // valor real que tiveram, e o mês atual fica fresco. Sem job de virada de
  // mês — que seria mais uma coisa pra falhar calada.
  try {
    results.retrato = await gravarRetratoDoMes()
  } catch (err) {
    console.error("[retrato mensal] falhou:", err)
    results.errors++
  }

  // ── Fecha o registro da execucao ─────────────────────────────────────────
  // ok = false quando houve QUALQUER erro: e o que faz /api/health devolver
  // 503 e o monitor externo alertar. Cron que falha metade e conta como
  // sucesso e pior que cron que nao roda, porque ninguem investiga.
  const semErro = results.errors === 0
  if (execucao) {
    await prisma.cronRun
      .update({
        where: { id: execucao.id },
        data: {
          finishedAt: new Date(),
          ok: semErro,
          detail: `${results.errors} erro(s); nps ${results.nps}, contratos ${results.contratos}, geocodificados ${results.geocoded}, cobrancas ${results.cobrancasEnviadas}`,
        },
      })
      .catch((e) => console.error("[cron] falha ao registrar execucao:", e))
  }

  // Aviso ao dono. Ate aqui o erro era contado e esquecido: o resultado ficava
  // no corpo de uma resposta HTTP que ninguem le.
  if (!semErro) {
    await avisarFalhaDoCron(results.errors, results).catch((e) =>
      console.error("[cron] falha ao avisar sobre o proprio erro:", e)
    )
  }

  return NextResponse.json({ ok: semErro, ...results })
}
