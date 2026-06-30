"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

type Technician = {
  id: string
  name: string
  latitude: number
  longitude: number
  updatedAt: Date | string
}

const Map = dynamic(() => import("./leaflet-map"), { ssr: false })

export function TechnicianMap({ initialTechnicians }: { initialTechnicians: Technician[] }) {
  const [technicians, setTechnicians] = useState(initialTechnicians)

  // Refresh locations every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/location/list")
      if (res.ok) {
        const data = await res.json()
        setTechnicians(data)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return <Map technicians={technicians} />
}
