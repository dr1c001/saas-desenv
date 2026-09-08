"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight, History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getMovimentosDaPeca } from "@/actions/estoque"

// O histórico da peça: quem mexeu, quanto, quando, por quê e onde.
//
// ─── Por que esta tela existe ────────────────────────────────────────────────
//
// Tudo isto já era GRAVADO — `StockMovement` guarda userId, createdAt, reason,
// locationId e toLocationId desde o começo — e nada no sistema mostrava. Havia
// até uma consulta pronta (`getPeca`, com as 50 últimas linhas) que nenhuma
// tela chamava.
//
// "Fica registrado" não é uma propriedade do banco. É uma propriedade do que a
// pessoa consegue abrir e ler três meses depois, quando falta peça e alguém
// precisa saber quem tirou.

type Movimento = {
  id: string
  type: "ENTRADA" | "SAIDA" | "AJUSTE"
  quantity: string | number
  balanceAfter: string | number
  reason: string | null
  createdAt: string | Date
  transferId: string | null
  user: { name: string } | null
  order: { number: number } | null
  purchaseOrder: { number: number } | null
  location: { name: string } | null
  toLocation: { name: string } | null
}

export function HistoricoDialog({
  partId,
  nome,
  unidade,
}: {
  partId: string
  nome: string
  unidade: string
}) {
  const t = useTranslations("estoqueHistorico")
  const [aberto, setAberto] = useState(false)
  const [linhas, setLinhas] = useState<Movimento[] | null>(null)

  // Busca só ao ABRIR: são 50 linhas por peça, e a tela de estoque pode ter
  // centenas de peças — carregar tudo junto seria uma consulta por linha.
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    getMovimentosDaPeca(partId).then((r) => {
      if (vivo) setLinhas(r as unknown as Movimento[])
    })
    return () => {
      vivo = false
    }
  }, [aberto, partId])

  // Fuso fixado em Brasília, como no `formatDate` do resto do sistema: sem
  // isso a hora sairia no fuso do navegador, e um mesmo movimento apareceria
  // com horas diferentes para o dono e para o técnico em viagem.
  const quando = (d: string | Date) =>
    new Date(d).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" title={t("titulo")}>
            <History className="size-4" />
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("titulo")}</DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>

        {linhas === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("vazio")}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {linhas.map((m) => {
              const q = Number(m.quantity)
              // `quantity` guarda a variação COM SINAL. O sinal é o que diz
              // entrada de saída num relance — mais rápido que ler o rótulo.
              const entrou = q > 0
              return (
                <li key={m.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className={entrou ? "text-emerald-600" : "text-destructive"}>
                          {entrou ? "+" : ""}
                          {q} {unidade}
                        </span>
                        <span className="ml-2 font-normal text-muted-foreground">
                          {t(`tipos.${m.type}` as "tipos.ENTRADA")}
                        </span>
                      </p>

                      {/* ONDE. Com setores, "saiu 4" sem dizer de onde não
                          fecha a conta de ninguém. */}
                      {m.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          {m.location.name}
                          {m.toLocation && (
                            <>
                              <ArrowRight className="size-3" />
                              {m.toLocation.name}
                            </>
                          )}
                        </p>
                      )}

                      {/* O PORQUÊ, como foi escrito por quem moveu. */}
                      {m.reason && <p className="mt-1 text-xs">{m.reason}</p>}

                      {/* De onde veio o movimento, quando não foi manual. */}
                      {m.order && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("daOs", { n: m.order.number })}
                        </p>
                      )}
                      {m.purchaseOrder && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("daCompra", { n: m.purchaseOrder.number })}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {/* QUANDO e QUEM. Sem nome, o histórico responde metade
                          da pergunta que motivou abri-lo. */}
                      <p className="tabular-nums">{quando(m.createdAt)}</p>
                      <p>{m.user?.name ?? t("semAutor")}</p>
                      <p className="tabular-nums">
                        {t("ficou", { q: `${Number(m.balanceAfter)} ${unidade}` })}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
