import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"

export async function GET() {
  const { tenantId, role } = await getTenant()
  // A página /map já é OWNER/ADMIN-only, mas essa API é uma rota
  // independente — sem essa checagem, qualquer papel podia chamá-la direto
  // e ver a localização GPS de todos os colegas. (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // Mapa GPS é feature paga (plano Pro+) — mesmo raciocínio das Server
  // Actions: bloqueio de página não protege rota despachável direto.
  // (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(tenantId)
  // Este comentário dizia "plano Pro+" desde julho, mas a verificação abaixo
  // não existia: requireActiveSubscription só olha se a assinatura está
  // ACTIVE, nunca QUAL plano. A intenção estava escrita, a trava não.
  if (!(await temRecurso(tenantId, "gpsMap"))) {
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
