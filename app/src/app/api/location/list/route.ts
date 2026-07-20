import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function GET() {
  const { tenantId, role } = await getTenant()
  // A página /map já é OWNER/ADMIN-only, mas essa API é uma rota
  // independente — sem essa checagem, qualquer papel podia chamá-la direto
  // e ver a localização GPS de todos os colegas. (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const locations = await prisma.userLocation.findMany({
    where: { user: { tenantId } },
    select: {
      latitude: true,
      longitude: true,
      updatedAt: true,
      user: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(
    locations.map((l) => ({
      id: l.user.id,
      name: l.user.name,
      latitude: l.latitude,
      longitude: l.longitude,
      updatedAt: l.updatedAt,
    }))
  )
}
