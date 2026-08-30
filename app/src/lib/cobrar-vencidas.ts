import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getTranslator } from "@/lib/i18n"
import { sendWhatsApp } from "@/lib/whatsapp"
import { sendDunningEmail } from "@/lib/resend"
import { hasActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { quemPaga } from "@/lib/subcliente"
import {
  canaisDaCobranca,
  decidirCobranca,
  DEGRAUS_DA_REGUA,
  diasDesdeVencimento,
  lerRegua,
  textoDaCobranca,
} from "@/lib/regua-cobranca"

// O EFEITO COLATERAL da régua de cobrança. A decisão mora em
// lib/regua-cobranca.ts, que é puro e testado; aqui só se busca, manda e grava.
//
// Vive fora de api/cron/daily/route.ts de propósito: aquele arquivo já tem
// nove etapas e passa de 500 linhas, e uma etapa que manda mensagem para o
// cliente final de terceiros merece poder ser lida inteira de uma vez.

/**
 * Teto de mensagens por execução.
 *
 * O cron tem `maxDuration = 60` e já divide esse orçamento com a reconciliação
 * da Asaas e a fila de geocodificação. Sem teto, uma empresa com 800 contas
 * vencidas consumiria a função inteira e derrubaria as etapas seguintes — que
 * incluem o retrato mensal e o registro de saúde.
 *
 * O que sobra não se perde: o contador não avança para quem não foi
 * processado, então a mesma conta é a primeira da fila amanhã.
 */
const MAX_POR_EXECUCAO = 200

/** Quantas contas olhar por empresa. Ver MAX_POR_EXECUCAO. */
const MAX_POR_EMPRESA = 100

export type ResultadoDaRegua = { enviadas: number; erros: number }

/**
 * Roda a régua de cobrança de todas as empresas que a ligaram.
 *
 * NUNCA lança: é uma etapa de cron entre outras, e derrubar as seguintes por
 * causa de um número de WhatsApp inválido seria pior que a mensagem não sair.
 * Os erros voltam contados, e o cron os soma ao próprio total — que é o que
 * faz /api/health devolver 503.
 */
export async function cobrarVencidas(agora: Date): Promise<ResultadoDaRegua> {
  const resultado: ResultadoDaRegua = { enviadas: 0, erros: 0 }

  // Só quem LIGOU. `dunningConfig` nulo é a esmagadora maioria, e filtrar no
  // banco evita trazer a tabela inteira de Tenant para descartar em memória.
  const empresas = await prisma.tenant.findMany({
    where: {
      dunningConfig: { not: Prisma.DbNull },
      // Não se manda mensagem em nome de quem parou de pagar. PAST_DUE entra
      // porque dentro da carência a empresa continua com acesso normal ao
      // sistema — cortar a régua em silêncio seria uma surpresa. Quem está
      // fora da carência cai no hasActiveSubscription abaixo.
      subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
    },
    select: {
      id: true,
      name: true,
      locale: true,
      dunningConfig: true,
      zapiInstance: true,
      zapiToken: true,
    },
  })

  for (const empresa of empresas) {
    if (resultado.enviadas >= MAX_POR_EXECUCAO) break

    try {
      const config = lerRegua(empresa.dunningConfig)
      if (!config.ativo) continue
      if (!(await hasActiveSubscription(empresa.id))) continue

      // A trava do plano, checada A CADA EXECUÇÃO e não só na hora de salvar.
      //
      // O caso que obriga isso: a empresa liga a régua no Pro e depois desce
      // para o Starter. A configuração continua gravada com `ativo: true`, e
      // uma trava que morasse só na tela de salvar deixaria o cron seguir
      // cobrando para sempre — entregando de graça o recurso que motivou o
      // upgrade, justamente para quem desistiu dele.
      //
      // `temRecurso` e não `requireRecurso`: aquele usa getTranslations, que
      // precisa de contexto de requisição, e aqui é cron. E não é erro — é
      // um plano que não inclui, então passa em silêncio.
      if (!(await temRecurso(empresa.id, "reguaCobranca"))) continue

      const contas = await prisma.revenue.findMany({
        where: {
          tenantId: empresa.id,
          // PAID nunca é cobrada. O guarda existe também dentro de
          // decidirCobranca — aqui é só para não trazer o que não interessa.
          status: { not: "PAID" },
          paidAt: null,
          // Quem já passou por todos os degraus não volta para a fila. Sem
          // isto, a carteira antiga inteira seria lida todo dia para
          // descartar tudo em memória.
          remindersSent: { lt: DEGRAUS_DA_REGUA.length },
          // Nada antes do primeiro degrau. `DEGRAUS[0]` é negativo (lembrete
          // antes de vencer), então a janela começa no futuro.
          dueDate: { lte: limiteDaJanela(agora) },
        },
        orderBy: { dueDate: "asc" },
        take: MAX_POR_EMPRESA,
        select: {
          id: true,
          description: true,
          amount: true,
          dueDate: true,
          remindersSent: true,
          // Revenue não tem cliente próprio: quem se cobra vem da OS que
          // gerou a receita. Receita lançada à mão (sem OS) não tem a quem
          // cobrar, e a régua a ignora — ver `destinatario`.
          //
          // O `parent` vem junto na MESMA consulta de propósito: quem paga
          // pode ser o contratante, e buscá-lo depois seria uma query por
          // conta — 100 contas viram 100 idas ao banco dentro de um cron com
          // 60 segundos de orçamento.
          order: {
            select: {
              payerId: true,
              client: {
                select: {
                  id: true,
                  parentId: true,
                  whatsapp: true,
                  phone: true,
                  email: true,
                  parent: {
                    select: { id: true, whatsapp: true, phone: true, email: true },
                  },
                },
              },
            },
          },
        },
      })

      for (const conta of contas) {
        if (resultado.enviadas >= MAX_POR_EXECUCAO) break

        const decisao = decidirCobranca({
          dias: diasDesdeVencimento(conta.dueDate, agora),
          jaEnviadas: conta.remindersSent,
          paga: false,
          valor: Number(conta.amount),
          config,
        })

        // Grava o contador mesmo quando NÃO envia. `decidirCobranca` devolve
        // sempre o total certo, inclusive nos caminhos silenciosos (degrau
        // desligado, vencimento renegociado) — e é isso que faz a régua andar
        // sem depender de a mensagem ter saído.
        if (decisao.total !== conta.remindersSent) {
          await prisma.revenue.update({
            where: { id: conta.id },
            data: { remindersSent: decisao.total },
          })
        }

        if (!decisao.enviar || !decisao.tom) continue

        try {
          const foi = await mandar(conta, empresa, config, decisao.tom)
          if (foi) resultado.enviadas++
        } catch (err) {
          console.error(`[régua] falhou na receita ${conta.id}:`, err)
          resultado.erros++
        }
      }
    } catch (err) {
      console.error(`[régua] falhou na empresa ${empresa.id}:`, err)
      resultado.erros++
    }
  }

  return resultado
}

/**
 * O vencimento mais distante que ainda interessa hoje.
 *
 * `DEGRAUS[0]` é negativo, então o primeiro degrau acontece ANTES de vencer:
 * com a régua padrão, uma conta que vence daqui a 3 dias já precisa de
 * lembrete. Somar o degrau (negativo) subtrai — por isso o sinal invertido.
 */
function limiteDaJanela(agora: Date): Date {
  const limite = new Date(agora)
  limite.setUTCDate(limite.getUTCDate() - DEGRAUS_DA_REGUA[0])
  return limite
}

type Empresa = {
  name: string
  locale: string
  zapiInstance: string | null
  zapiToken: string | null
}

type Contato = { whatsapp: string | null; phone: string | null; email: string | null }

type Conta = {
  description: string
  amount: Prisma.Decimal
  dueDate: Date
  order: {
    payerId: string | null
    client: (Contato & { id: string; parentId: string | null; parent: (Contato & { id: string }) | null }) | null
  } | null
}

/**
 * A quem a cobrança vai: QUEM PAGA, e não quem recebeu o serviço.
 *
 * A distinção é a razão de lib/subcliente.ts existir. Quando a administradora
 * contrata e o condomínio recebe, cobrar o condomínio é cobrar quem não deve —
 * constrange o cliente final e não chega em quem tem a fatura. A escolha do
 * pagador já está gravada na OS; aqui só se obedece a ela.
 *
 * `null` quando não há a quem cobrar: receita lançada à mão, sem OS.
 */
function destinatario(conta: Conta): Contato | null {
  const cliente = conta.order?.client
  if (!cliente) return null

  const pagador = quemPaga({ id: cliente.id, parentId: cliente.parentId }, conta.order?.payerId)
  if (pagador === cliente.id) return cliente
  // O contratante veio na mesma consulta. Se por algum motivo não veio (dado
  // inconsistente), cobrar o próprio cliente é melhor que não cobrar ninguém.
  return cliente.parent?.id === pagador ? cliente.parent : cliente
}

/** Manda por onde der. `false` quando não havia canal aberto. */
async function mandar(
  conta: Conta,
  empresa: Empresa,
  config: ReturnType<typeof lerRegua>,
  tom: NonNullable<ReturnType<typeof decidirCobranca>["tom"]>
): Promise<boolean> {
  const alvo = destinatario(conta)
  if (!alvo) return false

  const numero = alvo.whatsapp || alvo.phone
  const canais = canaisDaCobranca(config, {
    whatsappConfigurado: Boolean(empresa.zapiInstance && empresa.zapiToken),
    temWhatsapp: Boolean(numero),
    temEmail: Boolean(alvo.email),
  })
  if (!canais.whatsapp && !canais.email) return false

  const locale = empresa.locale === "en" ? "en" : "pt"
  const t = getTranslator(locale, "whatsapp")
  const moeda = locale === "en" ? "USD" : "BRL"

  const texto = textoDaCobranca(
    tom,
    {
      empresa: empresa.name,
      descricao: conta.description,
      valor: new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
        style: "currency",
        currency: moeda,
      }).format(Number(conta.amount)),
      // Data no fuso de quem lê. Sem `timeZone`, um vencimento gravado como
      // meia-noite UTC vira o dia anterior em Brasília — e a mensagem cobraria
      // uma data um dia diferente da que está na tela do sistema.
      vencimento: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
        dateStyle: "short",
        timeZone: locale === "en" ? "UTC" : "America/Sao_Paulo",
      }).format(conta.dueDate),
    },
    (chave, vals) => t(chave as "reguaCobranca.lembrete", vals)
  )

  const assunto = `${empresa.name} — ${t(`reguaCobranca.assunto.${tom}` as "reguaCobranca.assunto.lembrete")}`

  // Os dois canais em paralelo e independentes: falha de um não impede o
  // outro. allSettled porque o objetivo é nunca lançar por causa de um canal.
  const saidas = await Promise.allSettled([
    canais.whatsapp && numero
      ? sendWhatsApp(empresa.zapiInstance!, empresa.zapiToken!, numero, texto)
      : Promise.resolve(false),
    canais.email && alvo.email
      ? sendDunningEmail(alvo.email, empresa.name, assunto, texto)
      : Promise.resolve(false),
  ])

  return saidas.some((s) => s.status === "fulfilled" && Boolean(s.value))
}
