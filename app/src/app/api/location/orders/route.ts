import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"

export async function GET() {
  const { tenantId, role } = await getTenant()
  // A página /map já é OWNER/ADMIN-only, mas essa API é uma rota
  // independente — sem essa checagem, qualquer papel via endereço/GPS de
  // todas as OS abertas do tenant. (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // Mapa GPS é feature paga (plano Pro+) — mesmo raciocínio das Server
  // Actions: bloqueio de página não protege rota despachável direto.
  // (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(tenantId)

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
