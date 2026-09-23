"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, MoreVertical } from "lucide-react"
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
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  alternarManutencao,
  darBaixa,
  excluirBem,
  reativarBem,
  type EstadoBem,
} from "@/actions/patrimonio"
import { BemDialog, type BemDoFormulario } from "@/components/bens/bem-dialog"

// As ações de um bem, num menu só.
//
// ─── Por que BAIXA e não exclusão ────────────────────────────────────────────
//
// Bem que a empresa teve de verdade não se apaga: ele existiu, custou dinheiro
// e depreciou, e o contador precisa dessa história para fechar o exercício.
// Apagar reescreveria o passado.
//
// Excluir existe só para o que nunca deveria ter existido — cadastro duplicado,
// erro de digitação — e por isso é só do dono, e some quando há histórico.

export function BemAcoes({
  bem,
  locais,
  equipe,
  podeExcluir,
}: {
  bem: BemDoFormulario
  locais: { id: string; name: string }[]
  equipe: { id: string; name: string }[]
  podeExcluir: boolean
}) {
  const t = useTranslations("bens")
  const [editando, setEditando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [pendente, iniciar] = useTransition()

  const baixado = bem.status === "BAIXADO"
  const emManutencao = bem.status === "MANUTENCAO"

  const chamar = (fn: () => Promise<EstadoBem>) =>
    iniciar(async () => {
      const r = await fn()
      if (r?.erro) alert(t(`erros.${r.erro}` as "erros.semPermissao"))
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" disabled={pendente}>
              {pendente ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreVertical className="size-4" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditando(true)}>{t("editar")}</DropdownMenuItem>

          {!baixado && (
            <DropdownMenuItem onClick={() => chamar(() => alternarManutencao(bem.id))}>
              {emManutencao ? t("voltarDeManutencao") : t("porManutencao")}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {baixado ? (
            <DropdownMenuItem onClick={() => chamar(() => reativarBem(bem.id))}>
              {t("reativar")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setBaixando(true)}>{t("darBaixa")}</DropdownMenuItem>
          )}

          {podeExcluir && (
            <DropdownMenuItem
              onClick={() => {
                if (!confirm(t("confirmarExcluir"))) return
                chamar(() => excluirBem(bem.id))
              }}
              className="text-destructive"
            >
              {t("excluir")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <BemDialog
        bem={bem}
        locais={locais}
        equipe={equipe}
        aberto={editando}
        onFechar={() => setEditando(false)}
      />

      <BaixaDialog
        bemId={bem.id}
        nome={bem.name}
        compradoEm={bem.purchasedAt}
        aberto={baixando}
        onFechar={() => setBaixando(false)}
      />
    </>
  )
}

function BaixaDialog({
  bemId,
  nome,
  compradoEm,
  aberto,
  onFechar,
}: {
  bemId: string
  nome: string
  /** AAAA-MM-DD. Vira o `min` do campo: baixa antes da compra não existe. */
  compradoEm: string
  aberto: boolean
  onFechar: () => void
}) {
  const t = useTranslations("bens")
  const [estado, formAction, salvando] = useActionState<EstadoBem, FormData>(
    darBaixa.bind(null, bemId),
    {}
  )

  if (estado.ok && aberto) setTimeout(onFechar, 0)

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("darBaixa")}</DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="disposedAt">{t("dataBaixa")}</Label>
            <Input
              id="disposedAt"
              name="disposedAt"
              type="date"
              // A depreciação PARA nesta data. Antes da compra é impossível, e
              // o banco também recusa — aqui o campo já nem deixa escolher.
              min={compradoEm}
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="max-w-48"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="disposalNotes">{t("motivoBaixa")}</Label>
            <Input id="disposalNotes" name="disposalNotes" maxLength={500} />
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.semPermissao")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t("confirmarBaixa")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
