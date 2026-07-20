"use client"

import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useEffect, useRef } from "react"

export type Technician = {
  id: string
  name: string
  latitude: number
  longitude: number
  updatedAt: Date | string
}

export type ServiceOrderPin = {
  id: string
  number: number
  title: string
  status: string
  clientName: string
  technicianName: string | null
  city: string | null
  latitude: number
  longitude: number
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: "#f97316",
  IN_PROGRESS: "#3b82f6",
}

// Leaflet's bindPopup(string) sets it as innerHTML — nome/título/cidade vêm
// de Client/ServiceOrder/User (qualquer papel pode criar/editar cliente), e
// sem escapar isso é XSS armazenado que executa na sessão de quem abrir o
// mapa (só OWNER/ADMIN). (Achado em revisão de segurança 2026-07-19.)
function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildSvgIcon(L: typeof import("leaflet"), color: string, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 10 16 24 16 24S32 26 32 16C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="8" fill="white"/>
      <text x="16" y="20" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">${label}</text>
    </svg>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  })
}

function buildTechIcon(L: typeof import("leaflet")) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <path d="M18 0C8.1 0 0 8.1 0 18c0 11.25 18 26 18 26S36 29.25 36 18C36 8.1 27.9 0 18 0z" fill="#7c3aed" stroke="white" stroke-width="2"/>
      <circle cx="18" cy="17" r="8" fill="white"/>
      <text x="18" y="14" text-anchor="middle" font-size="9" fill="#7c3aed">👷</text>
    </svg>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  })
}

export default function LeafletMap({
  technicians,
  orders,
}: {
  technicians: Technician[]
  orders: ServiceOrderPin[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current) return

    if (!mapRef.current) {
      const allPoints = [
        ...technicians.map((t) => [t.latitude, t.longitude] as [number, number]),
        ...orders.map((o) => [o.latitude, o.longitude] as [number, number]),
      ]
      const center: [number, number] = allPoints.length > 0 ? allPoints[0] : [-15.7801, -47.9292]

      mapRef.current = L.map(containerRef.current).setView(center, 12)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapRef.current)

      if (allPoints.length > 1 && mapRef.current) {
        mapRef.current.fitBounds(allPoints, { padding: [40, 40] })
      }
    }

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()

    const techIcon = buildTechIcon(L)

    technicians.forEach((tech) => {
      if (!mapRef.current) return
      const time = new Date(tech.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      const marker = L.marker([tech.latitude, tech.longitude], { icon: techIcon })
        .addTo(mapRef.current)
        .bindPopup(`<b>👷 ${escapeHtml(tech.name)}</b><br><span style="color:#666">Técnico · atualizado ${time}</span>`)
      markersRef.current.set("tech-" + tech.id, marker)
    })

    orders.forEach((order) => {
      if (!mapRef.current) return
      const color = STATUS_COLOR[order.status] ?? "#6b7280"
      const label = order.status === "IN_PROGRESS" ? "▶" : "OS"
      const icon = buildSvgIcon(L, color, label)
      const statusLabel = order.status === "OPEN" ? "Aberta" : "Em andamento"
      const techLine = order.technicianName ? `<br>👷 ${escapeHtml(order.technicianName)}` : ""
      const marker = L.marker([order.latitude, order.longitude], { icon })
        .addTo(mapRef.current)
        .bindPopup(
          `<b>OS #${order.number} — ${escapeHtml(order.title)}</b><br>` +
            `<span style="color:#666">🏠 ${escapeHtml(order.clientName)}${order.city ? ` · ${escapeHtml(order.city)}` : ""}</span>` +
            techLine +
            `<br><span style="font-size:11px;color:${color}">${statusLabel}</span>`
        )
      markersRef.current.set("os-" + order.id, marker)
    })
  }, [technicians, orders])

  return <div ref={containerRef} className="h-[520px] w-full rounded-lg border overflow-hidden" />
}
