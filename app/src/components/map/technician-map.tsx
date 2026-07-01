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
      const [techRes, ordersRes] = await Promise.all([
        fetch("/api/location/list"),
        fetch("/api/location/orders"),
      ])
      if (techRes.ok) setTechnicians(await techRes.json())
      if (ordersRes.ok) setOrders(await ordersRes.json())
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return <Map technicians={technicians} orders={orders} />
}
