import type { Prisma } from "@/generated/prisma/client"
import { CAMPOS_DA_COMISSAO, decidirComissao } from "@/lib/comissao-db"
import { formatOsNumber } from "@/lib/utils"

// O conferente das comissões.
//
// ─── O defeito que ele existe para achar ─────────────────────────────────────
//
// A comissão é mantida por um reconciliador chamado de cinco pontos. Nenhum
// desses cinco é o problema: o problema é o SEXTO, que ainda não existe. Um
// caminho novo que mexa em OS e esqueça de chamá-lo deixa a comissão parada no
// valor velho — e o reconciliador engole erro de propósito, para não impedir o
// técnico de fechar a OS na rua, então uma falha some no log.
//
// E aí vem a assimetria que torna isto necessário:
//
//   comissão FALTANDO alguém reclama — o técnico cobra no dia 5.
//   comissão ERRADA ninguém nota — R$ 120 e R$ 180 são os dois plausíveis.
//
// ─── Por que ele NÃO corrige ─────────────────────────────────────────────────
//
// Corrigir sozinho reescreveria um número que a pessoa já viu, que é
// exatamente o que o desenho inteiro evita. E, se o reconciliador tiver um
// defeito, um cron que conserta ESPALHA o defeito em silêncio em vez de
// revelá-lo — o pior desfecho possível para dinheiro a pagar.
//
// Ele olha, compara e avisa. Quem decide é gente.

export type TipoDeDivergencia =
  /** Deveria existir comissão e não existe. */
  | "faltando"
  /** Existe, mas com valor diferente do que a regra diz hoje. */
  | "valorDiferente"
  /** Existe uma comissão pendente que não deveria mais existir. */
  | "sobrando"

export type Divergencia = {
  orderId: string
  /** Como a OS aparece na tela — OS20260042, e não um id. */
  numero: string
  tipo: TipoDeDivergencia
  /** Em reais, para a mensagem. */
  esperado: number | null
  atual: number | null
}

/**
 * Quantos dias para trás procurar comissão FALTANDO.
 *
 * As comissões pendentes são conferidas sem limite de data — são poucas e são o
 * caso que interessa. Já procurar por "OS concluída que deveria ter comissão e
 * não tem" exige varrer OS, e varrer a história inteira todo dia sairia caro
 * para achar, quase sempre, nada.
 *
 * 45 dias cobre com folga a janela em que alguém ainda repara: a comissão vence
 * no dia 5 do mês seguinte, então o mês inteiro mais o fechamento cabem aqui.
 * O que fica de fora é dito em voz alta no resultado, e não escondido.
 */
export const DIAS_PARA_TRAS = 45

/** Diferença menor que isto é arredondamento, não divergência. */
const TOLERANCIA_EM_REAIS = 0.005

export type ResumoDaConferencia = {
  conferidas: number
  divergencias: Divergencia[]
  /** OS concluídas fora da janela de 45 dias, não olhadas. Dito, não escondido. */
  foraDaJanela: number
}

/**
 * Confere as comissões de uma empresa. Não escreve nada.
 *
 * `agora` entra por parâmetro para o teste poder olhar o passado sem mexer no
 * relógio do processo.
 */
export async function conferirComissoes(
  db: Prisma.TransactionClient,
  tenantId: string,
  agora: Date
): Promise<ResumoDaConferencia> {
  const empresa = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { fiscalIssRate: true, commissionBase: true },
  })
  const issRate = empresa?.fiscalIssRate ?? null
  const base = empresa?.commissionBase ?? "TOTAL"

  const desde = new Date(agora.getTime() - DIAS_PARA_TRAS * 24 * 60 * 60 * 1000)

  // As despesas de comissão PENDENTES desta empresa. As pagas ficam de fora de
  // propósito: elas estão congeladas por decisão de desenho, então acusá-las
  // como divergentes seria gritar lobo todo dia, para sempre, até alguém
  // desligar o conferente — e aí ele deixaria de servir para o que serve.
  const pendentes = await db.expense.findMany({
    where: { tenantId, status: "PENDING", orderId: { not: null } },
    select: { orderId: true, amount: true },
  })
  const porOs = new Map(pendentes.map((e) => [e.orderId!, Number(e.amount)]))

  // As OS que precisam ser olhadas: as que já têm comissão pendente (qualquer
  // data) mais as concluídas na janela.
  const ordens = await db.serviceOrder.findMany({
    where: {
      tenantId,
      OR: [
        { id: { in: [...porOs.keys()] } },
        { concludedAt: { gte: desde } },
      ],
    },
    select: CAMPOS_DA_COMISSAO,
  })

  const divergencias: Divergencia[] = []

  for (const os of ordens) {
    const deveria = decidirComissao(os, issRate, base)
    const esperado = deveria ? deveria.valorCentavos / 100 : null
    const atual = porOs.has(os.id) ? porOs.get(os.id)! : null
    const numero = formatOsNumber(os.number, os.createdAt)

    if (esperado !== null && atual === null) {
      // Cuidado: a comissão pode existir e estar PAGA — e paga é congelada, não
      // divergente. `porOs` só tem pendentes, então uma paga cairia aqui como
      // "faltando". Por isso a checagem extra.
      const paga = await db.expense.findFirst({
        where: { orderId: os.id, status: "PAID" },
        select: { id: true },
      })
      if (paga) continue
      divergencias.push({ orderId: os.id, numero, tipo: "faltando", esperado, atual: null })
      continue
    }

    if (esperado === null && atual !== null) {
      divergencias.push({ orderId: os.id, numero, tipo: "sobrando", esperado: null, atual })
      continue
    }

    if (esperado !== null && atual !== null && Math.abs(esperado - atual) > TOLERANCIA_EM_REAIS) {
      divergencias.push({ orderId: os.id, numero, tipo: "valorDiferente", esperado, atual })
    }
  }

  const foraDaJanela = await db.serviceOrder.count({
    where: {
      tenantId,
      concludedAt: { lt: desde },
      commissionPct: { not: null },
      id: { notIn: [...porOs.keys()] },
    },
  })

  return { conferidas: ordens.length, divergencias, foraDaJanela }
}

/**
 * O corpo do aviso, em uma linha.
 *
 * Diz QUANTAS e cita as três primeiras pelo número da OS. Um aviso que só
 * informa a contagem obriga a pessoa a abrir a tela para descobrir o que olhar;
 * um que lista trinta não cabe numa notificação de celular.
 */
export function resumirDivergencias(divergencias: readonly Divergencia[]): string {
  const primeiras = divergencias.slice(0, 3).map((d) => d.numero).join(", ")
  const resto = divergencias.length - Math.min(3, divergencias.length)
  return resto > 0 ? `${primeiras} e mais ${resto}` : primeiras
}
