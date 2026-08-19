import { getTranslations } from "next-intl/server"
import { History } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import type { TipoEvento } from "@/lib/historico-os"

type EventoNaTela = {
  id: string
  type: string
  actorName: string | null
  before: string | null
  after: string | null
  createdAt: Date
}

/**
 * Linha do tempo da OS.
 *
 * Server component: é só leitura, e renderizar no servidor evita mandar a
 * biblioteca de datas e o histórico inteiro para o navegador.
 */
export async function HistoricoOs({
  eventos,
  locale,
}: {
  eventos: EventoNaTela[]
  locale: "pt" | "en"
}) {
  if (eventos.length === 0) return null

  const t = await getTranslations("historicoOs")
  const tc = await getTranslations("common")
  const dateLocale = locale === "en" ? "en-US" : "pt-BR"

  // Status é o único campo cujo valor guardado é um CÓDIGO — traduzido aqui,
  // para o histórico não ficar em português numa conta em inglês. Os demais
  // já foram gravados legíveis. (Ver lib/historico-os.ts.)
  const legivel = (tipo: string, valor: string | null): string => {
    if (!valor) return t("vazio")
    if (tipo === "STATUS") {
      const chave = `serviceOrderStatus.${valor}` as "serviceOrderStatus.OPEN"
      return tc.has(chave) ? tc(chave) : valor
    }
    if (tipo === "VALOR") return formatCurrency(Number(valor))
    if (tipo === "AGENDAMENTO") return new Date(valor).toLocaleString(dateLocale)
    if (tipo === "GARANTIA") return t("dias", { n: Number(valor) })
    return valor
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <History className="size-4" />
          {t("titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {eventos.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="min-w-0">
                <p>
                  {e.type === "CRIADA" || e.type === "CONCLUSAO" ? (
                    t(`eventos.${e.type}` as "eventos.CRIADA")
                  ) : (
                    t.rich(`eventos.${e.type as TipoEvento}` as "eventos.STATUS", {
                      de: () => <strong>{legivel(e.type, e.before)}</strong>,
                      para: () => <strong>{legivel(e.type, e.after)}</strong>,
                    })
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {/* Nome de quem saiu da empresa continua aqui: foi gravado
                      como texto justamente por isso. */}
                  {e.actorName ?? t("alguem")}
                  {" · "}
                  {new Date(e.createdAt).toLocaleString(dateLocale, {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
