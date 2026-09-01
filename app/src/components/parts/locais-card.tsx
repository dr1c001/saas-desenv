"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, MapPin, Plus, Truck, Warehouse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { alternarLocal, salvarLocal, type EstadoLocal } from "@/actions/estoque-locais"
import { TIPOS_DE_LOCAL, type TipoDeLocal } from "@/lib/estoque-local"

// Os locais de estoque, na tela de peças.
//
// Fica ACIMA da lista de peças de propósito: a primeira coisa que quem abre
// esta tela precisa entender é que agora existe "onde", e não só "quanto".

export type LocalNaTela = {
  id: string
  name: string
  type: TipoDeLocal
  active: boolean
  user: { name: string } | null
  _count: { balances: number }
}

export function LocaisCard({
  locais,
  tecnicos,
  isAdmin,
}: {
  locais: LocalNaTela[]
  /** Para dizer de quem é a van. Só a equipe desta empresa. */
  tecnicos: { id: string; name: string }[]
  isAdmin: boolean
}) {
  const t = useTranslations("estoqueLocais")
  const [pendente, iniciar] = useTransition()

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-muted-foreground" />
            {t("titulo")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {isAdmin && <LocalDialog tecnicos={tecnicos} />}
      </CardHeader>

      <CardContent>
        {locais.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("semLocais")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {locais.map((l) => (
              <li
                key={l.id}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                  l.active ? "" : "opacity-60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {l.type === "VEICULO" ? (
                    <Truck className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Warehouse className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {l.name}
                      {/* De quem é a van. "Van 01" não diz nada numa lista de
                          seis; "Van 01 — Carlos" diz. */}
                      {l.type === "VEICULO" && l.user && (
                        <span className="font-normal text-muted-foreground"> — {l.user.name}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l._count.balances > 0 ? t("pecasDentro", { n: l._count.balances }) : t("vazio")}
                      {!l.active && ` · ${t("inativo")}`}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1">
                    <LocalDialog tecnicos={tecnicos} local={l} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await alternarLocal(l.id)
                          // O erro que importa: o local tem peça dentro.
                          // Desativar esconderia o saldo sem ele ter saído.
                          if (r?.erro) alert(t(`errors.${r.erro}` as "errors.localComPeca"))
                        })
                      }
                    >
                      {l.active ? t("desativar") : t("ativar")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LocalDialog({
  tecnicos,
  local,
}: {
  tecnicos: { id: string; name: string }[]
  local?: LocalNaTela
}) {
  const t = useTranslations("estoqueLocais")
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoDeLocal>(local?.type ?? "ALMOXARIFADO")
  const [estado, formAction, salvando] = useActionState<EstadoLocal, FormData>(
    salvarLocal.bind(null, local?.id ?? null),
    {}
  )

  if (estado.ok && aberto) setTimeout(() => setAberto(false), 0)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant={local ? "ghost" : "outline"}>
            {local ? (
              t("editar")
            ) : (
              <>
                <Plus className="size-4 mr-1.5" />
                {t("novo")}
              </>
            )}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{local ? t("editar") : t("novo")}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("nome")}</Label>
            <Input id="name" name="name" defaultValue={local?.name} required maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">{t("tipo")}</Label>
            <select
              id="type"
              name="type"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDeLocal)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {TIPOS_DE_LOCAL.map((x) => (
                <option key={x} value={x}>
                  {t(`tipos.${x}` as "tipos.VEICULO")}
                </option>
              ))}
            </select>
          </div>

          {/* Só o veículo tem dono: almoxarifado é da empresa. */}
          {tipo === "VEICULO" && (
            <div className="space-y-1.5">
              <Label htmlFor="userId">{t("responsavel")}</Label>
              <select
                id="userId"
                name="userId"
                defaultValue={local?.user ? undefined : ""}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">{t("semResponsavel")}</option>
                {tecnicos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`errors.${estado.erro}` as "errors.nomeRepetido")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t("salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Badge de contagem, para a lista de peças mostrar em quantos locais está. */
export function EmQuantosLocais({ n }: { n: number }) {
  const t = useTranslations("estoqueLocais")
  if (n <= 1) return null
  return (
    <Badge variant="secondary" className="text-[11px]">
      {t("pecasDentro", { n })}
    </Badge>
  )
}
