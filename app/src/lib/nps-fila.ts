import { prisma } from "@/lib/prisma"
import { sendNpsEmail } from "@/lib/resend"
import { funcaoLigada } from "@/lib/funcoes"
import { emailDaEmpresa } from "@/lib/envio-db"

/**
 * A fila da pesquisa de satisfação: quem recebe, em que ordem, e o que sai
 * da fila sem receber.
 *
 * ─── O defeito que isto corrige ──────────────────────────────────────────────
 *
 * O cron pegava as 100 primeiras OS elegíveis e, no laço, PULAVA (`continue`)
 * as que não tinham como ir: cliente sem e-mail, empresa com o NPS desligado.
 * Pular não marca nada — a linha continuava elegível e voltava amanhã, na
 * mesma posição, porque a consulta não tinha `orderBy`. Uma carteira com 100
 * clientes sem e-mail ocupava as 100 vagas do dia para sempre, e nenhuma
 * pesquisa da plataforma inteira saía mais. Sem log, sem erro: o cron gravava
 * "nps 0" e seguia. (Achado na auditoria de 13/09/2026.)
 *
 * ─── As três regras ──────────────────────────────────────────────────────────
 *
 * 1. Quem não tem para onde ir NÃO ENTRA na fila — o filtro é no banco, como
 *    cobrar-vencidas.ts faz com a régua. E o que ainda assim passar (e-mail ""
 *    em dado antigo, regra que divergiu do filtro) SAI marcando a tentativa.
 * 2. Mais antigas primeiro, e determinístico: o lote de hoje não é o de ontem.
 * 3. Depois de JANELA_MAXIMA_DIAS a pesquisa não mede satisfação, mede
 *    memória — e chega como spam. É também o que impede QUALQUER linha de
 *    ficar elegível para sempre.
 *
 * Marca `npsSentAt` ANTES de enviar — mesma escolha do aviso de atraso no
 * cron: falhar perde UMA pesquisa, recuperável e contada como erro; marcar
 * depois deixava a linha na fila para sempre se o envio falhasse, e uma morte
 * da função entre enviar e marcar mandaria o mesmo e-mail amanhã.
 */
export const DIAS_APOS_CONCLUSAO = 7
export const JANELA_MAXIMA_DIAS = 30
export const MAX_POR_EXECUCAO = 100

export type ResultadoDoNps = { enviadas: number; descartadas: number; erros: number }

export async function enviarPesquisasDeSatisfacao(agora: Date): Promise<ResultadoDoNps> {
  const r: ResultadoDoNps = { enviadas: 0, descartadas: 0, erros: 0 }
  const ateOnde = new Date(agora)
  ateOnde.setDate(ateOnde.getDate() - DIAS_APOS_CONCLUSAO)
  const desdeOnde = new Date(agora)
  desdeOnde.setDate(desdeOnde.getDate() - JANELA_MAXIMA_DIAS)

  const fila = await prisma.serviceOrder.findMany({
    where: {
      // completeServiceOrder com faturamento imediato vai direto a INVOICED,
      // sem passar por DONE — os dois contam (achado de 28/07/2026).
      status: { in: ["DONE", "INVOICED"] },
      concludedAt: { gte: desdeOnde, lte: ateOnde },
      npsSentAt: null,
      npsScore: null,
      clientToken: { not: null },
      client: { email: { not: null } },
      // Espelho de funcaoLigada("nps", disabledFeatures), lib/funcoes.ts.
      tenant: { NOT: { disabledFeatures: { has: "nps" } } },
    },
    orderBy: { concludedAt: "asc" },
    take: MAX_POR_EXECUCAO,
    select: {
      id: true,
      clientToken: true,
      client: { select: { email: true, name: true } },
      tenant: { select: { id: true, name: true, locale: true, disabledFeatures: true } },
    },
  })

  // A resposta vai para o dono da empresa; uma consulta por empresa, e não
  // por OS.
  const respostaPorEmpresa = new Map<string, string | null>()

  for (const os of fila) {
    const semDestino =
      !os.client.email?.trim() ||
      !os.clientToken ||
      !funcaoLigada("nps", os.tenant.disabledFeatures)
    await prisma.serviceOrder.update({ where: { id: os.id }, data: { npsSentAt: agora } })
    if (semDestino) {
      r.descartadas++
      continue
    }

    if (!respostaPorEmpresa.has(os.tenant.id)) {
      respostaPorEmpresa.set(os.tenant.id, await emailDaEmpresa(os.tenant.id))
    }
    try {
      await sendNpsEmail(
        os.client.email!,
        os.client.name,
        os.tenant.name,
        os.clientToken!,
        os.tenant.locale,
        respostaPorEmpresa.get(os.tenant.id) ?? null
      )
      r.enviadas++
    } catch (err) {
      console.error(`[nps] falhou na OS ${os.id}:`, err)
      r.erros++
    }
  }
  return r
}
