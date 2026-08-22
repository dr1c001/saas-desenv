import webPush from "web-push"
import { prisma } from "@/lib/prisma"

let vapidConfigured = false

// Configurar dentro da função (não no escopo do módulo): setVapidDetails
// valida as chaves e lança se faltarem — em ambientes sem VAPID_* (ex.: CI)
// isso quebraria o build de qualquer rota que use push, só de importar.
function ensureVapidConfigured() {
  if (!vapidConfigured) {
    webPush.setVapidDetails(
      process.env.VAPID_CONTACT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
    vapidConfigured = true
  }
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  icon?: string
}

export type ResumoDoEnvio = {
  enviadas: number
  /** Inscrições que morreram e foram apagadas nesta rodada. */
  removidas: number
  /** Falhas passageiras — o aparelho continua inscrito e recebe da próxima. */
  falharam: number
}

/**
 * A inscrição morreu de vez, ou foi só um tropeço?
 *
 * **404 e 410 são definitivos.** O serviço de push (Google, Apple, Mozilla)
 * responde assim quando o aparelho desinstalou o app, limpou os dados do
 * navegador, ou a inscrição expirou. Não adianta tentar de novo: aquele
 * endereço não existe mais.
 *
 * Qualquer outro código é passageiro — rede, indisponibilidade, limite. Apagar
 * a inscrição nesses casos seria pior que o problema: a pessoa pararia de
 * receber notificação para sempre por causa de uma instabilidade de dez
 * segundos, e ninguém ligaria uma coisa à outra.
 */
export function inscricaoMorreu(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/**
 * Envia, e LIMPA o que morreu.
 *
 * A limpeza não é higiene: até 22/08/2026 o resultado de cada envio era
 * devolvido e ninguém olhava — os dois pontos que chamam descartavam a
 * resposta dentro de um `catch` vazio. Inscrição morta ficava no banco para
 * sempre, cada envio gastava uma ida à rede para um endereço inexistente, e
 * **se todas falhassem ninguém descobriria**: sem erro, sem log, sem contador.
 *
 * Nunca lança. Notificação é acessório — falhar em avisar não pode derrubar a
 * criação da OS que gerou o aviso.
 */
export async function sendPushToUser(
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload
): Promise<ResumoDoEnvio> {
  if (subscriptions.length === 0) return { enviadas: 0, removidas: 0, falharam: 0 }

  ensureVapidConfigured()

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  )

  const mortas: string[] = []
  let enviadas = 0
  let falharam = 0

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      enviadas++
      return
    }
    const status = (r.reason as { statusCode?: number } | undefined)?.statusCode
    if (inscricaoMorreu(status)) mortas.push(subscriptions[i].endpoint)
    else falharam++
  })

  if (mortas.length > 0) {
    // Por endpoint: é ele que identifica o aparelho, e é ele que o serviço de
    // push declarou inexistente.
    try {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: mortas } } })
    } catch (err) {
      // Não conseguir limpar não pode derrubar o envio que já deu certo.
      console.error("[push] falha ao remover inscrições mortas:", err)
    }
  }

  // Registra quando NADA chegou. É o caso que passava despercebido: sem esta
  // linha, uma configuração errada de VAPID silenciaria as notificações da
  // empresa inteira sem deixar rastro.
  if (enviadas === 0 && (falharam > 0 || mortas.length > 0)) {
    console.error(
      `[push] nenhuma notificação entregue: ${falharam} falha(s), ${mortas.length} inscrição(ões) morta(s)`
    )
  }

  return { enviadas, removidas: mortas.length, falharam }
}
