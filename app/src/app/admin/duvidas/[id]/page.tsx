import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getDuvida } from "@/actions/admin-duvidas"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResponderDuvida } from "@/components/admin/responder-duvida"

// Uma conversa, com o retrato de quem perguntou.
//
// O retrato é o que estava valendo NO MOMENTO da pergunta — plano, situação da
// assinatura, cargo, tela. Ele é lido da linha, e não do banco ao vivo: um
// upgrade no dia seguinte faria "por que não vejo o mapa?" parecer maluca.

export default async function DuvidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Chama `requireSuperAdmin("atenderDuvida")` por dentro.
  const d = await getDuvida(id)
  if (!d) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/duvidas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para a fila
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{d.tenantName}</h1>
          <p className="text-sm text-muted-foreground">
            {d.authorName} ({d.authorEmail}) · {d.authorRole}
          </p>
        </div>
        <Badge variant={d.status === "ABERTA" ? "default" : "secondary"}>
          {d.status === "ABERTA"
            ? "Esperando você"
            : d.status === "RESPONDIDA"
              ? "Respondida"
              : "Fechada"}
        </Badge>
      </div>

      {/* O retrato do momento. Responde metade da pergunta antes de lê-la. */}
      <Card>
        <CardContent className="grid gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-2">
          <Linha rotulo="Plano na hora da pergunta" valor={d.planName ?? "Sem plano"} />
          <Linha rotulo="Assinatura" valor={d.subscriptionStatus} />
          <Linha
            rotulo="Tela onde estava"
            valor={d.screenCode ? `${d.screenCode} · ${d.screenRoute}` : "Não informada"}
          />
          <Linha rotulo="Aberta em" valor={new Date(d.createdAt).toLocaleString("pt-BR")} />
          {d.tenantId === null && (
            <p className="text-xs text-amber-600 sm:col-span-2 dark:text-amber-400">
              Esta empresa foi apagada. A conversa ficou — é a única memória de que a
              pergunta foi feita.
            </p>
          )}
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {d.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg px-4 py-3 ${
              m.kind === "CLIENTE" ? "bg-muted" : "bg-primary/10"
            }`}
          >
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {m.authorName} · {new Date(m.createdAt).toLocaleString("pt-BR")}
            </p>
            {/* Texto puro, sempre. O corpo foi escrito por um usuário: é DADO,
                nunca marcação nem instrução. */}
            <p className="whitespace-pre-wrap text-sm">{m.body}</p>
          </li>
        ))}
      </ul>

      <ResponderDuvida id={d.id} fechada={d.status === "FECHADA"} />
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{rotulo}: </span>
      {valor}
    </p>
  )
}
