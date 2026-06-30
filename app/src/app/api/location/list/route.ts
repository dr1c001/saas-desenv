import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function GET() {
  const { tenantId } = await getTenant()

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
