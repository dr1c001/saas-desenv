import { prisma } from "@/lib/prisma"

/**
 * Uma PENDÊNCIA DE CONFIGURAÇÃO: algo que alguém precisa resolver, e que não
 * é uma tarefa de fundo que falhou.
 *
 * ─── O defeito que isto corrige ──────────────────────────────────────────────
 *
 * Em 15/09/2026 o vigia de DMARC entrou no cron contando a política ausente
 * como `results.errors++`. Isso parecia certo — o fundador precisa saber —, e
 * estava errado em três lugares de uma vez:
 *
 * 1. `CronRun.ok` passou a ser `false` TODO DIA. E `/api/health` procura a
 *    última execução com `ok: true`: o endereço que um monitor externo
 *    consulta ficou devolvendo 503 por seis dias, dizendo "cron degradado",
 *    com o banco respondendo e as dezessete etapas completas todo dia.
 * 2. O e-mail de alarme dizia "parte das tarefas de fundo não rodou" — e todas
 *    tinham rodado.
 * 3. Chegava todo dia, sem nada de novo para dizer.
 *
 * Alarme que grita todo dia por algo que não é queda é o alarme que a pessoa
 * aprende a ignorar — e aí ele não funciona no dia de verdade. `lib/saude.ts`
 * já dizia isso, sobre atraso normal do cron; a lição valia aqui também.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────
 *
 * `CronRun.ok` responde UMA pergunta: as tarefas rodaram? Pendência de
 * configuração não mexe nela, não mexe em `/api/health`, e avisa UMA VEZ por
 * estado — de novo só quando o estado mudar.
 *
 * A dedup é a chave única de `PlatformAlert`, o mesmo mecanismo de
 * `avisarPlataforma`: gravar a chave É a reivindicação de "este fato já foi
 * avisado", e duas execuções concorrentes não conseguem gravar a mesma.
 */
export async function avisarPendenciaUmaVez(args: {
  /** O estado ENTRA na chave: `config:dmarc:ausente` e `config:dmarc:fraca`
   *  são fatos diferentes, e o segundo merece um aviso novo. */
  chave: string
  detalhe: string
  enviar: () => Promise<unknown>
}): Promise<boolean> {
  try {
    await prisma.platformAlert.create({
      data: { key: args.chave, event: "configuracaoPendente", detail: args.detalhe },
    })
  } catch {
    // Chave repetida: já foi avisado. Não é erro — é o mecanismo funcionando.
    return false
  }

  try {
    await args.enviar()
    return true
  } catch (e) {
    // A linha fica gravada mesmo com o envio falhando, e é isso que permite
    // responder depois "por que não fui avisado": linha ausente = o gatilho
    // nunca rodou; linha presente = rodou e a mensagem não saiu.
    console.error("[pendência] falha ao avisar:", args.chave, e)
    return false
  }
}
