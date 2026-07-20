import webPush from "web-push"

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

export async function sendPushToUser(
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload
) {
  ensureVapidConfigured()
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  )
  return results
}
