import Link from "next/link"
import { MessageCircleQuestion } from "lucide-react"
import { getFilaDeDuvidas } from "@/actions/admin-duvidas"
import { resumo } from "@/lib/duvida"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

// A fila de dúvidas dos clientes.
//
// Ordenada por quem espera há MAIS TEMPO, e não pelo mais recente: ordenar pelo
// novo enterraria justamente quem está esperando desde ontem.

const COR: Record<string, "default" | "secondary" | "outline"> = {
  ABERTA: "default",
  RESPONDIDA: "secondary",
  FECHADA: "outline",
}

const FILTROS = ["", "ABERTA", "RESPONDIDA", "FECHADA"] as const

export default async function DuvidasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  // `getFilaDeDuvidas` chama `requireSuperAdmin("atenderDuvida")` por dentro —
  // a checagem do layout não protege nada que seja alcançado por outro caminho.
  const fila = await getFilaDeDuvidas(status)

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dúvidas dos clientes</h1>
        <p className="text-sm text-muted-foreground">
          Quem espera há mais tempo aparece primeiro.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f || "abertas"}
            href={f ? `/admin/duvidas?status=${f}` : "/admin/duvidas"}
            className={buttonVariants({
              size: "sm",
              variant: (status ?? "") === f ? "default" : "outline",
            })}
          >
            {f === "" ? "Em aberto" : f === "ABERTA" ? "Esperando você" : f === "RESPONDIDA" ? "Respondidas" : "Fechadas"}
          </Link>
        ))}
      </div>

      {fila.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessageCircleQuestion className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma dúvida por aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {fila.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/duvidas/${d.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{d.tenantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.authorName} · {d.authorRole} ·{" "}
                          {d.planName ?? "sem plano"} · {d.subscriptionStatus}
                        </p>
                      </div>
                      <Badge variant={COR[d.status] ?? "outline"}>
                        {d.status === "ABERTA"
                          ? "Esperando você"
                          : d.status === "RESPONDIDA"
                            ? "Respondida"
                            : "Fechada"}
                      </Badge>
                    </div>

                    {/* Texto puro. O corpo foi escrito pelo cliente: é DADO, e
                        nunca marcação nem instrução. */}
                    <p className="text-sm">{resumo(d.messages[0]?.body ?? "", 160)}</p>

                    <p className="text-xs text-muted-foreground">
                      {d.screenCode ? `Estava em ${d.screenCode} ${d.screenRoute}` : "Tela não informada"}
                      {" · "}
                      {d.messageCount} mensagem(ns)
                      {" · "}
                      {new Date(d.lastMessageAt).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
