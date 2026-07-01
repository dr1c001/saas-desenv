import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TechnicianMap } from "@/components/map/technician-map"
import { MapPin, RefreshCw, Wrench } from "lucide-react"

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-orange-500",
  IN_PROGRESS: "bg-blue-500",
}

export default async function MapPage() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const [locationRows, orderRows] = await Promise.all([
    prisma.userLocation.findMany({
      where: { user: { tenantId } },
      select: {
        latitude: true,
        longitude: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.serviceOrder.findMany({
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
    }),
  ])

  const technicians = locationRows.map((l) => ({
    id: l.user.id,
    name: l.user.name,
    latitude: l.latitude,
    longitude: l.longitude,
    updatedAt: l.updatedAt,
  }))

  const orders = orderRows
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

  const hasAnything = technicians.length > 0 || orders.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mapa GPS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Técnicos em campo e ordens de serviço abertas
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5" />
          Atualiza a cada 30s
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-purple-600" />
          Técnicos ({technicians.length})
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
          OS Abertas ({orders.filter((o) => o.status === "OPEN").length})
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
          Em andamento ({orders.filter((o) => o.status === "IN_PROGRESS").length})
        </div>
      </div>

      {/* Technician cards */}
      {technicians.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {technicians.map((t) => (
            <div key={t.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <MapPin className="size-3.5 text-purple-600" />
                {t.name}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(t.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* OS cards */}
      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Wrench className="size-3.5 text-orange-500" />
                OS #{o.number}
              </div>
              <p className="text-xs truncate">{o.title}</p>
              <p className="text-xs text-muted-foreground truncate">{o.clientName}</p>
              <span
                className={`mt-1 inline-block text-xs px-1.5 py-0.5 rounded text-white ${STATUS_COLOR[o.status] ?? "bg-gray-500"}`}
              >
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasAnything ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <MapPin className="size-12 opacity-30" />
          <p className="font-medium">Nenhum dado no mapa ainda</p>
          <p className="text-sm max-w-xs">
            Técnicos precisam ativar localização e clientes precisam ter endereço cadastrado.
          </p>
        </div>
      ) : (
        <TechnicianMap initialTechnicians={technicians} initialOrders={orders} />
      )}
    </div>
  )
}
