import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"

export async function GET() {
  const { tenantId } = await getTenant()

  const orders = await prisma.serviceOrder.findMany({
    where: {
      tenantId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      client: { address: { latitude: { not: null } } },
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      technician: { select: { name: true } },
      client: {
        select: {
          name: true,
          address: { select: { latitude: true, longitude: true, city: true } },
        },
      },
    },
  })

  return NextResponse.json(
    orders
      .filter((o) => o.client.address?.latitude && o.client.address?.longitude)
      .map((o) => ({
        id: o.id,
        number: o.number,
        title: o.title,
        status: o.status,
        clientName: o.client.name,
        technicianName: o.technician?.name ?? null,
        city: o.client.address?.city ?? null,
        latitude: o.client.address!.latitude!,
        longitude: o.client.address!.longitude!,
      }))
  )
}
