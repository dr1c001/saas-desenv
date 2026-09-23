"use client"

import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight, Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getSaldosDaPeca, transferir, type EstadoLocal } from "@/actions/estoque-locais"
import { MAX_MOTIVO } from "@/lib/estoque-local"

// "Onde está esta peça?" — a pergunta que o recurso inteiro existe para
// responder — e a transferência entre locais, na mesma tela.
//
// Os dois juntos de propósito: ver que há 4 na van do Carlos e 0 no
// almoxarifado é exatamente o momento em que se quer mover. Separar em duas
// telas faria a pessoa decorar o número e procurar o botão.

type Saldo = {
  locationId: string
  quantity: string | number
  location: { name: string; type: string; active: boolean }
}

export function OndeEstaDialog({
  partId,
  nome,
  unidade,
  podeTransferir,
}: {
  partId: string
  nome: string
  unidade: string
  /** Transferir mexe em saldo. Só dono e administrador. */
  podeTransferir: boolean
}) {
  const t = useTranslations("estoqueLocais")
  const [aberto, setAberto] = useState(false)
  const [saldos, setSaldos] = useState<Saldo[] | null>(null)
  const [origemId, setOrigemId] = useState("")
  const [destinoId, setDestinoId] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [estado, formAction, enviando] = useActionState<EstadoLocal, FormData>(transferir, {})

  // Busca só ao ABRIR: carregar a distribuição de toda peça junto com a
  // listagem seria uma consulta por linha numa tela que pode ter centenas.
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    getSaldosDaPeca(partId).then((r) => {
      if (vivo) setSaldos(r as unknown as Saldo[])
    })
    return () => {
      vivo = false
    }
  }, [aberto, partId])

  // Depois de transferir, relê: os números na tela acabaram de mudar, e
  // mostrar os antigos convidaria a uma segunda transferência errada.
  useEffect(() => {
    if (!estado.ok) return
    // As duas escritas ficam DENTRO do `then`, e não no corpo do efeito:
    // `setState` síncrono num efeito dispara uma renderização em cascata — e
    // aqui não há motivo para limpar o campo antes de os números novos
    // chegarem. Limpar junto é inclusive melhor: o valor some quando a tela
    // se atualiza, e não meio segundo antes.
    getSaldosDaPeca(partId).then((r) => {
      setSaldos(r as unknown as Saldo[])
      setQuantidade("")
    })
  }, [estado.ok, partId])

  const num = (s: Saldo) => Number(s.quantity)
  const naOrigem = saldos?.find((s) => s.locationId === origemId)
  const disponivel = naOrigem ? num(naOrigem) : 0
  // A lista responde "onde está": local com zero não é onde a peça está.
  const ondeTem = saldos?.filter((s) => num(s) !== 0) ?? []
  // O formulário responde outra pergunta — "para onde pode ir" —, e aí o local
  // vazio É o destino que interessa. Dois recortes da mesma resposta.
  const paraOnde = saldos?.filter((s) => s.location.active) ?? []

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" title={t("ondeEsta")}>
            <MapPin className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ondeEsta")}</DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>

        {saldos === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : ondeTem.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("semSaldo")}</p>
        ) : (
          <ul className="space-y-1.5">
            {ondeTem.map((s) => (
              <li
                key={s.locationId}
                className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
              >
                <span className={s.location.active ? "" : "text-muted-foreground line-through"}>
                  {s.location.name}
                </span>
                <span className="font-medium tabular-nums">
                  {num(s)} {unidade}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Dois locais ATIVOS bastam — não dois locais com saldo. Exigir saldo
            nos dois lados era o que impedia a peça de chegar num setor recém
            criado: ele nunca aparecia como destino. */}
        {podeTransferir && paraOnde.length > 1 && (
          <form action={formAction} className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">{t("transferirTitulo")}</p>
            <input type="hidden" name="partId" value={partId} />

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="origemId" className="text-xs">
                  {t("de")}
                </Label>
                <select
                  id="origemId"
                  name="origemId"
                  value={origemId}
                  onChange={(e) => setOrigemId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {/* Origem precisa TER: transferir de um local vazio criaria
                      saldo do nada no destino. */}
                  {paraOnde
                    .filter((s) => num(s) > 0)
                    .map((s) => (
                      <option key={s.locationId} value={s.locationId}>
                        {s.location.name} ({num(s)})
                      </option>
                    ))}
                </select>
              </div>

              <ArrowRight className="mb-2.5 size-4 shrink-0 text-muted-foreground" />

              <div className="flex-1 space-y-1.5">
                <Label htmlFor="destinoId" className="text-xs">
                  {t("para")}
                </Label>
                <select
                  id="destinoId"
                  name="destinoId"
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {/* Destino NÃO precisa ter nada — é justamente o setor vazio
                      que se quer abastecer. */}
                  {paraOnde
                    .filter((s) => s.locationId !== origemId)
                    .map((s) => (
                      <option key={s.locationId} value={s.locationId}>
                        {s.location.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantidade" className="text-xs">
                {t("quantidade")}
              </Label>
              <Input
                id="quantidade"
                name="quantidade"
                type="number"
                step="0.001"
                min={0}
                max={disponivel || undefined}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="max-w-40"
              />
              {origemId && (
                <p className="text-xs text-muted-foreground">
                  {t("disponivel", { q: `${disponivel} ${unidade}` })}
                </p>
              )}
            </div>

            {/* O porquê. Opcional de propósito: campo obrigatório de
                justificativa ensina a digitar "x" para o formulário passar, e
                aí o histórico passa a mentir — pior do que estar vazio. */}
            <div className="space-y-1.5">
              <Label htmlFor="motivo" className="text-xs">
                {t("motivo")}
              </Label>
              <Input
                id="motivo"
                name="motivo"
                maxLength={MAX_MOTIVO}
                placeholder={t("motivoExemplo")}
              />
            </div>

            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`errors.${estado.erro}` as "errors.saldoInsuficiente")}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" size="sm" disabled={enviando || !origemId || !destinoId}>
                {enviando && <Loader2 className="size-4 mr-2 animate-spin" />}
                {t("confirmar")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
