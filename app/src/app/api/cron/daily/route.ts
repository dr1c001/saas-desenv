import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendOnboardingDay3Email,
  sendTrialEndingEmail,
  sendPastDueWarningEmail,
  avisarFalhaDoCron,
  avisarPendenciaDeConfiguracao,
} from "@/lib/resend"
import { enviarPesquisasDeSatisfacao } from "@/lib/nps-fila"
import { conferirDmarc } from "@/lib/conferir-dmarc"
import { NOME_DMARC } from "@/lib/dmarc"
import { avisarPendenciaUmaVez } from "@/lib/pendencia"
import { confirmarPagamento } from "@/lib/confirmar-pagamento"
import { aplicarTrocaAgendada } from "@/lib/troca-de-plano-db"
import { decidirAviso, diasDeAtraso, AVISOS_ATRASO } from "@/lib/past-due"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { provedor } from "@/lib/geocode"
import { avancarFila, geocodificarAvulso, semCoordenada } from "@/lib/geocode-fila"
import { ambiente, ehProducao } from "@/lib/ambiente"
import { gerarOsDosContratos } from "@/lib/gerar-os-de-contrato"
import { DIAS_DE_ANTECEDENCIA } from "@/lib/contrato-recorrente"
import { gravarRetratoDoMes } from "@/lib/snapshot"
import { conciliarNotasPendentes } from "@/lib/nfse-conciliar"
import { conferirComissoes, resumirDivergencias } from "@/lib/comissao-conferente"
import { AVISOS_DE_FIM, decidirAvisoDeFim, diasRestantes, lembreteDoDia3 } from "@/lib/teste-gratis"
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

  const results = { day3: 0, nps: 0, rateLimitCleanup: 0, stuckPending: 0, reconciled: 0, geocoded: 0, avisosAtraso: 0, cobrancasEnviadas: 0, contratos: 0, certificadosVencendo: 0, notasConsultadas: 0, notasRejeitadas: 0, notasNaoArquivadas: 0, avisosDeTeste: 0, comissoesConferidas: 0, comissoesDivergentes: 0, comissoesForaDaJanela: 0, trocasDePlano: 0, retrato: "", dmarc: "", errors: 0 }

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
  // idempotente: chama lib/confirmar-pagamento.ts, o MESMO que o webhook. Este
  // comentário dizia isso desde agosto, e o código não fazia: reimplementava
  // só a troca de status, e quem era reativado por aqui pagava sem receber
  // contrato, quem o indicou não ganhava o bônus, e o desconto de indicação
  // ficava vitalício na Asaas. (Achado na auditoria de 13/09/2026.)
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

      console.error(
        `[reconciliacao] assinatura ${sub.asaasId} paga na Asaas (${paid.id}) mas ${sub.status} aqui — ` +
          `webhook provavelmente nao chegou. Reativando tenant ${sub.tenantId}.`
      )
      // O mesmo caminho do webhook: reivindicar + ativar numa escrita só, e os
      // efeitos (push, preço cheio, bônus de indicação, contrato por e-mail).
      // Aqui se AGUARDA o e-mail em vez de after(): o cron é processo de fundo
      // com 60 s de orçamento, e reconciliação de verdade é rara.
      const confirmacao = await confirmarPagamento({ subscriptionId: sub.id, paymentId: paid.id })
      await confirmacao.pendente
      if (confirmacao.resultado === "ativada") results.reconciled++
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

  // ── Dica no dia 3 pra quem está no teste e ainda não criou a primeira OS ─────
  // Era "pra quem ainda não assinou", com texto dizendo que o acesso estava
  // bloqueado — escrito quando não havia teste grátis. O teste voltou em
  // 14/09/2026 e o texto ficou: todo destinatário tinha acesso total e lia que
  // estava bloqueado. A regra do que mandar mora em lib/teste-gratis.ts
  // (lembreteDoDia3) e é a mesma regra de acesso do resto do sistema.
  // (Achado na auditoria de 13/09/2026.)
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
      select: {
        locale: true,
        vocabulary: true,
        trialEndsAt: true,
        _count: { select: { orders: true } },
        users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
      },
    })
    for (const t of day3Tenants) {
      // Regra em lib/teste-gratis.ts, testada lá — aqui só o efeito colateral.
      const decisao = lembreteDoDia3({ trialEndsAt: t.trialEndsAt, ordens: t._count.orders }, now)
      if (!decisao.enviar) continue
      const owner = t.users[0]
      if (!owner?.email) continue
      try {
        await sendOnboardingDay3Email(owner.email, owner.name, decisao.diasRestantes, t)
        results.day3++
      } catch { results.errors++ }
    }
  } catch (e) {
    console.error("[cron] lembrete de acompanhamento falhou:", e)
    results.errors++
  }

  // ── NPS: OS concluída há 7+ dias, nunca contatada ────────────────────────────
  // A fila inteira mora em lib/nps-fila.ts — quem entra, em que ordem, o que
  // sai sem receber. Ficava aqui, e a versão daqui PULAVA (`continue`) quem
  // não tinha e-mail ou tinha o NPS desligado, sem marcar nada: a linha voltava
  // amanhã na mesma vaga, e 100 clientes sem e-mail travavam o NPS da
  // plataforma inteira, para sempre. (Achado na auditoria de 13/09/2026;
  // as três correções de 28/07/2026 — INVOICED conta, 7+ dias e não
  // exatamente 7, npsSentAt marca a tentativa — continuam lá.)
  try {
    const nps = await enviarPesquisasDeSatisfacao(now)
    results.nps = nps.enviadas
    results.errors += nps.erros
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
  //
  // ─── Este `try` fechava 159 linhas abaixo ──────────────────────────────────
  //
  // O `catch` dele ficava depois da conferência das comissões, e no meio
  // estavam, indentados com os mesmos dois espaços como se fossem irmãos,
  // QUATRO blocos independentes: certificado vencendo, conciliação de notas
  // fiscais, avisos de fim do teste grátis e conferência das comissões.
  //
  // Bastava `gerarOsDosContratos` lançar — e ela cria OS com
  // `(ultimo._max.number ?? 0) + 1` sem retry, às 09:00, horário em que um
  // atendente pode estar criando OS ao mesmo tempo — para o dia inteiro perder
  // as quatro. Ninguém era avisado de certificado vencendo, nota rejeitada pela
  // prefeitura passava em branco, quem estava no fim do teste não recebia aviso
  // (e `decidirAvisoDeFim` conta POSIÇÃO na escada: o marco passa e não volta),
  // e comissão divergente não era conferida. O log dizia só "Falha ao gerar OS
  // de contratos recorrentes", escondendo as outras quatro.
  //
  // Cada etapa em seu próprio try/catch, que é o que o comentário mais abaixo
  // já dizia ser o desenho. (Achado na auditoria de 13/09/2026.)
  try {
    const limiteContratos = new Date(now)
    limiteContratos.setUTCDate(limiteContratos.getUTCDate() + DIAS_DE_ANTECEDENCIA)
    results.contratos = await gerarOsDosContratos(now, limiteContratos)
  } catch (e) {
    console.error("[cron] geração de OS de contratos recorrentes falhou:", e)
    results.errors++
  }

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
    // Nota aceita cujo documento não entrou no arquivo. Já vem somada em
    // `notas.erros` — a empresa é obrigada a guardar o XML por cinco anos, e
    // uma tarefa que o cron tentou e não conseguiu É erro dele.
    results.notasNaoArquivadas = notas.naoArquivadas
    results.errors += notas.erros
  } catch (e) {
    console.error("[cron] conciliação de notas fiscais falhou:", e)
    results.errors++
  }

  // ── Teste grátis chegando ao fim ────────────────────────────────────────────
  //
  // Quem perde acesso sem aviso trata como defeito do sistema, e não como prazo
  // que acabou. É o mesmo raciocínio do aviso de inadimplência — e aqui é ainda
  // mais caro, porque a pessoa está justamente decidindo se compra.
  //
  // Três avisos (7, 3 e 1 dia). Um só, no último dia, não dá tempo de decidir,
  // falar com sócio nem passar no cartão.
  try {
    const testando = await prisma.tenant.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { not: null, gt: now },
        trialWarningsSent: { lt: AVISOS_DE_FIM.length },
      },
      select: {
        id: true,
        name: true,
        locale: true,
        vocabulary: true,
        trialEndsAt: true,
        trialWarningsSent: true,
        users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
      },
    })

    for (const empresa of testando) {
      const decisao = decidirAvisoDeFim(
        diasRestantes(empresa.trialEndsAt, now),
        empresa.trialWarningsSent
      )

      // Grava o contador mesmo quando não envia: ele conta POSIÇÃO na escada, e
      // não mensagens. Sem isso, um dia perdido deslocaria todos os avisos
      // seguintes.
      if (decisao.total !== empresa.trialWarningsSent) {
        await prisma.tenant.update({
          where: { id: empresa.id },
          data: { trialWarningsSent: decisao.total },
        })
      }
      if (!decisao.enviar) continue

      const dono = empresa.users[0]
      if (!dono?.email) continue
      try {
        await sendTrialEndingEmail(
          dono.email,
          dono.name,
          empresa.name,
          decisao.diasRestantes,
          empresa
        )
        results.avisosDeTeste++
      } catch (e) {
        console.error("[cron] falha ao avisar fim do teste:", empresa.id, e)
        results.errors++
      }
    }
  } catch (e) {
    console.error("[cron] avisos de fim de teste falharam:", e)
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
            vocabulary: true,
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
          sub.tenant,
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

  // ── Trocas de plano agendadas que já venceram ────────────────────────────
  // O downgrade vale no fim do período pago. Quem RENOVOU já foi atendido na
  // confirmação do pagamento (lib/confirmar-pagamento.ts); esta é a rede de
  // segurança para a assinatura que não renovou — ela não pode ficar no plano
  // caro para sempre só porque o pagamento não veio.
  try {
    const agendadas = await prisma.subscription.findMany({
      where: { pendingPlanId: { not: null }, currentPeriodEnd: { lte: now } },
      take: 50,
      select: { id: true, tenantId: true, pendingPlanId: true, currentPeriodEnd: true },
    })
    for (const sub of agendadas) {
      if (await aplicarTrocaAgendada(sub, now)) results.trocasDePlano++
    }
  } catch (e) {
    console.error("[cron] trocas de plano agendadas falharam:", e)
    results.errors++
  }

  // ── DMARC do domínio de e-mail ───────────────────────────────────────────
  // Sem política publicada qualquer um forja noreply@servicoos.com.br — e o
  // sistema manda cobrança em nome das empresas. Ninguém vê isso em log: a
  // Resend devolve sucesso porque ELA aceitou.
  //
  // É uma PENDÊNCIA DE CONFIGURAÇÃO, e não uma tarefa que falhou. Entre 15 e
  // 22/09/2026 isto contava erro do cron, e o preço foi alto: CronRun.ok
  // virou false todo dia, `/api/health` passou a devolver 503 dizendo "cron
  // degradado" (ele procura a última execução com ok=true) com o sistema
  // inteiro de pé, e o fundador recebia um e-mail vermelho diário dizendo que
  // as tarefas não tinham rodado — com as dezessete completas. Ver
  // lib/pendencia.ts. (Achado na auditoria de 13/09/2026; corrigido o remédio
  // em 22/09/2026.)
  //
  // Por último de propósito: é a etapa menos urgente, e não pode roubar tempo
  // das etapas de dinheiro.
  try {
    const veredito = await conferirDmarc()
    results.dmarc = veredito.estado
    if (veredito.precisaDeAcao) {
      console.error("[dmarc]", veredito.motivo)
      // O estado entra na chave: "ausente" e "fraca" são fatos diferentes.
      await avisarPendenciaUmaVez({
        chave: `config:dmarc:${veredito.estado}`,
        detalhe: veredito.motivo,
        enviar: () =>
          avisarPendenciaDeConfiguracao({
            titulo: "política DMARC do domínio de e-mail",
            motivo: veredito.motivo,
            comoResolver:
              `No registro.br, na zona de servicoos.com.br, publique um registro TXT com nome "_dmarc" ` +
              `e valor: v=DMARC1; p=quarantine; rua=mailto:suporte@servicoos.com.br — ` +
              `um registro só (dois fazem os provedores ignorarem os dois). ` +
              `O cron confere ${NOME_DMARC} todo dia e para de avisar quando estiver publicado.`,
          }),
      })
    }
  } catch (err) {
    // Aqui SIM é erro: a checagem em si não rodou.
    console.error("[dmarc] falhou:", err)
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
          // A linha que fica GRAVADA. Toda etapa nova precisa aparecer aqui —
          // um contador que existe so em memoria some quando a funcao termina,
          // e ai nao ha como saber, olhando producao, se a etapa rodou.
          //
          // Foi o que aconteceu com o conferente de comissoes: ele foi ligado
          // no cron em 05/09/2026, rodou tres dias seguidos, e nao havia
          // nenhuma forma de conferir isso. (Achado olhando a tabela de
          // execucoes em 08/09/2026.)
          // A linha que fica GRAVADA, e a UNICA janela para o que aconteceu:
          // a funcao termina, o objeto `results` some, e o que nao entrou aqui
          // deixa de existir.
          //
          // Sete etapas rodavam sem deixar rastro nenhum — entre elas o aviso
          // de atraso aos assinantes, o alerta de certificado vencendo e a nota
          // fiscal REJEITADA. E o conferente de comissoes, ligado tres dias
          // antes, tambem nao aparecia.
          //
          // Ha um teste que quebra quando alguem acrescenta um contador e
          // esquece desta linha: lib/__tests__/cron-resumo.test.ts.
          // (Achado olhando a tabela de execucoes em 08/09/2026.)
          detail: [
            `${results.errors} erro(s)`,
            `assinaturas ${results.reconciled} conciliadas/${results.stuckPending} presas`,
            `avisos de atraso ${results.avisosAtraso}`,
            `avisos de fim de teste ${results.avisosDeTeste}`,
            `onboarding ${results.day3}`,
            `nps ${results.nps}`,
            `contratos ${results.contratos}`,
            `cobrancas ${results.cobrancasEnviadas}`,
            `notas ${results.notasConsultadas} consultadas/${results.notasRejeitadas} rejeitadas` +
              (results.notasNaoArquivadas > 0
                ? `/${results.notasNaoArquivadas} NAO ARQUIVADAS`
                : ""),
            `certificados vencendo ${results.certificadosVencendo}`,
            `comissoes ${results.comissoesConferidas} conferidas/${results.comissoesDivergentes} divergentes` +
              (results.comissoesForaDaJanela > 0
                ? ` (${results.comissoesForaDaJanela} fora da janela)`
                : ""),
            `geocodificados ${results.geocoded}`,
            `limpeza ${results.rateLimitCleanup}`,
            `trocas de plano ${results.trocasDePlano}`,
            `dmarc ${results.dmarc}`,
          ].join("; "),
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
