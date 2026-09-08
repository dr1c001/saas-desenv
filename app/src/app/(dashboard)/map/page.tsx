import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { TechnicianMap } from "@/components/map/technician-map"
import { MapPin, RefreshCw, Wrench, AlertTriangle } from "lucide-react"
import Link from "next/link"

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-orange-500",
  IN_PROGRESS: "bg-blue-500",
}

export default async function MapPage() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")
  // "Mapa GPS" começa no plano Pro. A aba já some do menu (getAllowedTabs),
  // mas a URL continua digitável — e as duas rotas de API que alimentam o
  // mapa também checam por conta própria.
  if (!(await temRecurso(tenantId, "gpsMap"))) redirect("/billing")

  const t = await getTranslations("mapAdmin")
  const tCommon = await getTranslations("common")

  const [locationRows, orderRows, semCoordenada] = await Promise.all([
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
    // O mapa filtra por coordenada, então OS de cliente sem endereço
    // geocodificado simplesmente NÃO apareciam — sem contador, sem aviso, sem
    // nada. O dono via "nenhuma OS no mapa" e concluía que o mapa estava
    // quebrado. Agora elas vêm pra cá e viram um aviso com o nome do cliente,
    // que é o que ele precisa pra ir corrigir o endereço.
    // (Relatado pelo usuário em 10/08/2026.)
    prisma.serviceOrder.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { client: { address: { is: null } } },
          { client: { address: { latitude: null } } },
          { client: { address: { longitude: null } } },
        ],
      },
      select: {
        id: true,
        number: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { number: "asc" },
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
          <h1 className="text-2xl font-bold">{t("map.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("map.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5" />
          {t("map.autoRefresh")}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-purple-600" />
          {t("map.legend.technicians")} ({technicians.length})
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
          {t("map.legend.openOrders")} ({orders.filter((o) => o.status === "OPEN").length})
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
          {tCommon("serviceOrderStatus.IN_PROGRESS")} ({orders.filter((o) => o.status === "IN_PROGRESS").length})
        </div>
      </div>

      {semCoordenada.length > 0 && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {t("map.missingCoords.title", { count: semCoordenada.length })}
          </div>
          <p className="mt-1 text-xs opacity-90">{t("map.missingCoords.description")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {semCoordenada.map((o) => (
              <Link
                key={o.id}
                href={`/clients/${o.client.id}/edit`}
                className="rounded border border-amber-400/50 bg-background/60 px-2 py-1 text-xs hover:bg-background"
              >
                {t("map.orderNumber", { number: String(o.number) })} — {o.client.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Technician cards */}
      {technicians.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {technicians.map((tech) => (
            <div key={tech.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <MapPin className="size-3.5 text-purple-600" />
                {tech.name}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(tech.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
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
                {t("map.orderNumber", { number: String(o.number) })}
              </div>
              <p className="text-xs truncate">{o.title}</p>
              <p className="text-xs text-muted-foreground truncate">{o.clientName}</p>
              <span
                className={`mt-1 inline-block text-xs px-1.5 py-0.5 rounded text-white ${STATUS_COLOR[o.status] ?? "bg-gray-500"}`}
              >
                {tCommon(`serviceOrderStatus.${o.status}`)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasAnything ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <MapPin className="size-12 opacity-30" />
          <p className="font-medium">{t("map.empty.title")}</p>
          <p className="text-sm max-w-xs">
            {t("map.empty.description")}
          </p>
        </div>
      ) : (
        <TechnicianMap initialTechnicians={technicians} initialOrders={orders} />
      )}
    </div>
  )
}
