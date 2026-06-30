"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useRef } from "react"

type Technician = {
  id: string
  name: string
  latitude: number
  longitude: number
  updatedAt: Date | string
}

export default function LeafletMap({ technicians }: { technicians: Technician[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current) return

    const L = require("leaflet")
    // Fix default marker icon paths broken by webpack
    delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    })

    if (!mapRef.current) {
      const center: [number, number] =
        technicians.length > 0
          ? [technicians[0].latitude, technicians[0].longitude]
          : [-15.7801, -47.9292] // Brasília default

      mapRef.current = L.map(containerRef.current).setView(center, 13)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapRef.current)
    }

    // Remove old markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current.clear()

    // Add markers for each technician
    technicians.forEach((tech) => {
      if (!mapRef.current) return
      const updatedAt = new Date(tech.updatedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
      const marker = L.marker([tech.latitude, tech.longitude])
        .addTo(mapRef.current)
        .bindPopup(`<b>${tech.name}</b><br>Atualizado às ${updatedAt}`)
      markersRef.current.set(tech.id, marker)
    })
  }, [technicians])

  return (
    <div
      ref={containerRef}
      className="h-[500px] w-full rounded-lg border overflow-hidden"
    />
  )
}
