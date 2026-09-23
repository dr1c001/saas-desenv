"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import type { Technician, ServiceOrderPin } from "./leaflet-map"

const Map = dynamic(() => import("./leaflet-map"), { ssr: false })

export function TechnicianMap({
  initialTechnicians,
  initialOrders,
}: {
  initialTechnicians: Technician[]
  initialOrders: ServiceOrderPin[]
}) {
  const [technicians, setTechnicians] = useState(initialTechnicians)
  const [orders, setOrders] = useState(initialOrders)

  useEffect(() => {
    const interval = setInterval(async () => {
      // Sem isso, uma falha de rede/sessão expirada parava as atualizações
      // silenciosamente — o mapa continuava mostrando a última posição
      // conhecida como se estivesse atualizando a cada 30s de verdade.
      // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
      try {
        const [techRes, ordersRes] = await Promise.all([
          fetch("/api/location/list"),
          fetch("/api/location/orders"),
        ])
        if (techRes.ok) setTechnicians(await techRes.json())
        if (ordersRes.ok) setOrders(await ordersRes.json())
      } catch (err) {
        console.error("Falha ao atualizar posições do mapa:", err)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return <Map technicians={technicians} orders={orders} />
}
