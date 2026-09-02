"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { GRUPOS, type GrupoDoBalanco } from "@/lib/balanco"
import { excluirLinhaManual, salvarLinhaManual, type EstadoBalanco } from "@/actions/balanco"

// As linhas que vivem FORA do sistema: empréstimo, financiamento da van, imóvel
// não cadastrado, reserva de lucros.
//
// O formulário é genérico de propósito — grupo, descrição, valor. Um campo por
// tipo de linha faria o quarto tipo, quando aparecesse, ser esquecido.

export type LinhaDoFormulario = {
  id: string
  grupo: GrupoDoBalanco
  descricao: string
  valor: number
}

export function LinhaManualDialog({
  linha,
  aberto: abertoExterno,
  onFechar,
}: {
  linha?: LinhaDoFormulario
  aberto?: boolean
  onFechar?: () => void
}) {
  const t = useTranslations("balanco.manual")
  const tGrupos = useTranslations("balanco.grupos")
  const tErros = useTranslations("balanco.erros")

  const [abertoInterno, setAbertoInterno] = useState(false)
  const controlado = abertoExterno !== undefined
  const aberto = controlado ? abertoExterno : abertoInterno
  const fechar = () => (controlado ? onFechar?.() : setAbertoInterno(false))

  const [estado, formAction, salvando] = useActionState<EstadoBalanco, FormData>(
    salvarLinhaManual.bind(null, linha?.id ?? null),
    {}
  )

  if (estado.ok && aberto) setTimeout(fechar, 0)

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? setAbertoInterno(true) : fechar())}>
      {/* Sem gatilho quando controlado de fora: dois botões abririam o mesmo
          diálogo e o segundo pareceria não funcionar. */}
      {!controlado && (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <Plus className="size-4 mr-1.5" />
              {t("nova")}
            </Button>
          }
        />
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{linha ? t("editar") : t("nova")}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("descricao")}</Label>
            <Input
              id="description"
              name="description"
              required
              maxLength={120}
              defaultValue={linha?.descricao}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group">{t("grupo")}</Label>
            <select
              id="group"
              name="group"
              defaultValue={linha?.grupo ?? "PASSIVO_NAO_CIRCULANTE"}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            >
              {GRUPOS.map((g) => (
                <option key={g} value={g}>
                  {tGrupos(g as "ATIVO_CIRCULANTE")}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">{t("valor")}</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              required
              className="max-w-48"
              defaultValue={linha ? String(linha.valor) : ""}
            />
            <p className="text-[11px] text-muted-foreground">{t("valorAjuda")}</p>
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">{tErros(estado.erro as "valorInvalido")}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
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

export function LinhaManualAcoes({ linha }: { linha: LinhaDoFormulario }) {
  const t = useTranslations("balanco.manual")
  const tErros = useTranslations("balanco.erros")
  const [editando, setEditando] = useState(false)
  const [pendente, iniciar] = useTransition()

  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditando(true)}>
        {t("editar")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-destructive"
        disabled={pendente}
        onClick={() => {
          if (!confirm(t("confirmarExcluir"))) return
          iniciar(async () => {
            const r = await excluirLinhaManual(linha.id)
            if (r?.erro) alert(tErros(r.erro as "naoEncontrado"))
          })
        }}
      >
        {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>

      <LinhaManualDialog linha={linha} aberto={editando} onFechar={() => setEditando(false)} />
    </span>
  )
}
