import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireAba, requireActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"

export async function GET() {
  const { tenantId } = await getTenant()
  // Rota independente da página: sem checagem própria, qualquer papel a
  // chamava direto e via a localização GPS de todos os colegas. (Achado em
  // revisão de segurança 2026-07-19.)
  // A trava é a ABA, e não uma lista de cargos: esta rota alimenta /map, e as
  // duas precisam concordar. Com OWNER/ADMIN fixo aqui e a página liberada pela
  // aba, o GERENTE abriria o mapa e ele nunca atualizaria — 403 silencioso a
  // cada polling. `requireAba` lança, e o catch devolve o mesmo 403 de antes
  // para quem realmente não tem a aba. (15/09/2026.)
  try {
    await requireAba("map")
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // Mapa GPS é feature paga (plano Pro+) — mesmo raciocínio das Server
  // Actions: bloqueio de página não protege rota despachável direto.
  // (Achado em revisão de segurança pré-lançamento, 2026-07-28.)
  await requireActiveSubscription(tenantId)
  // "Mapa GPS" é vendido a partir do plano Pro — e até 10/08/2026 nada no
  // código verificava isso: o comentário acima dizia "feature paga", mas
  // requireActiveSubscription só olha se a assinatura está ACTIVE, nunca qual
  // plano é. Quem pagava R$ 97 tinha o mapa igual a quem pagava R$ 397.
  if (!(await temRecurso(tenantId, "gpsMap"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
