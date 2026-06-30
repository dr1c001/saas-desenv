import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TechnicianMap } from "@/components/map/technician-map"
import { MapPin, RefreshCw } from "lucide-react"

export default async function MapPage() {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const locations = await prisma.userLocation.findMany({
    where: { user: { tenantId } },
    select: {
      latitude: true,
      longitude: true,
      updatedAt: true,
      user: { select: { id: true, name: true } },
    },
  })

  const technicians = locations.map((l) => ({
    id: l.user.id,
    name: l.user.name,
    latitude: l.latitude,
    longitude: l.longitude,
    updatedAt: l.updatedAt,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mapa GPS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Localização em tempo real dos técnicos de campo
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5" />
          Atualiza a cada 30s
        </div>
      </div>

      {technicians.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <MapPin className="size-12 opacity-30" />
          <p className="font-medium">Nenhum técnico com localização ativa</p>
          <p className="text-sm max-w-xs">
            Os técnicos precisam permitir acesso à localização no navegador para aparecerem aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {technicians.map((t) => (
              <div key={t.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="size-3.5 text-primary" />
                  {t.name}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(t.updatedAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>

          <TechnicianMap initialTechnicians={technicians} />
        </>
      )}
    </div>
  )
}
