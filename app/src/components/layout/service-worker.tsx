"use client"

import { useEffect } from "react"

// O registro do service worker ficava dentro do PushSubscriber, atrás de um
// `if (!("PushManager" in window)) return`. No iPhone o PushManager só existe
// depois que o app é instalado na tela inicial — ou seja, no Safari comum o
// service worker nunca era registrado e o modo offline nunca ligaria. Agora o
// registro é independente: offline não deveria depender de notificação.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    // Falha de registro não pode derrubar a tela — sem service worker o app
    // continua funcionando normalmente, só perde o offline.
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])

  return null
}
