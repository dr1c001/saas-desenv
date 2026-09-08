"use client"

import { useEffect, useRef } from "react"

// Runs on every logged-in user — technicians share location every 60s
export function LocationTracker() {
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return

    function send(pos: GeolocationPosition) {
      fetch("/api/location/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      }).catch((err) => console.error("Falha ao enviar localização:", err))
    }

    // Sem callback de erro, negar a permissão de localização (comum no
    // primeiro uso) ficava indistinguível de "app fechado" ou "sem sinal" —
    // o técnico simplesmente sumia do mapa sem nenhuma pista de por quê.
    // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
    function onError(err: GeolocationPositionError) {
      console.error("Falha ao obter localização:", err.message)
    }

    // Get immediately, then watch
    navigator.geolocation.getCurrentPosition(send, onError)
    watchId.current = navigator.geolocation.watchPosition(send, onError, {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 15000,
    })

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  return null
}
