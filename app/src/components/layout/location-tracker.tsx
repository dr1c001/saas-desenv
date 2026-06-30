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
      })
    }

    // Get immediately, then watch
    navigator.geolocation.getCurrentPosition(send)
    watchId.current = navigator.geolocation.watchPosition(send, undefined, {
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
