"use client"

import { useEffect } from "react"

export function PushSubscriber() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      // Ask permission only if not already granted
      if (Notification.permission === "default") {
        await Notification.requestPermission()
      }
      if (Notification.permission !== "granted") return

      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        // Already subscribed — sync to server
        await syncSubscription(existing)
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })
      await syncSubscription(sub)
    })
  }, [])

  return null
}

async function syncSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  })
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}
