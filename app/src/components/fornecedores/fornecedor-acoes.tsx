"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Loader2, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  alternarFornecedor,
  excluirFornecedor,
  type EstadoFornecedor,
} from "@/actions/fornecedores"

// As ações de um fornecedor.
//
// ─── Por que DESATIVAR e não excluir ─────────────────────────────────────────
//
// Fornecedor de quem a empresa já comprou tem histórico: as ordens de compra e
// as cotações em que ele deu preço. Apagar levava tudo isso junto — e como a
// única forma de corrigir um dado errado era apagar e recadastrar, o caminho
// para perder o histórico era o caminho NORMAL de uso.
//
// Agora corrigir é editar, e parar de comprar de alguém é desativar. Excluir
// sobrou para o que nunca deveria ter existido: o cadastro duplicado, o erro de
// digitação — e some assim que houver qualquer histórico.

export function FornecedorAcoes({
  id,
  ativo,
  temHistorico,
  podeExcluir,
}: {
  id: string
  ativo: boolean
  temHistorico: boolean
  podeExcluir: boolean
}) {
  const t = useTranslations("fornecedores")
  const [pendente, iniciar] = useTransition()

  const chamar = (fn: () => Promise<EstadoFornecedor>) =>
    iniciar(async () => {
      const r = await fn()
      if (r?.erro) alert(t(`erros.${r.erro}` as "erros.semPermissao"))
    })

  return (
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
        <DropdownMenuItem render={<Link href={`/fornecedores/${id}`}>{t("verFicha")}</Link>} />
        <DropdownMenuItem render={<Link href={`/fornecedores/${id}/editar`}>{t("editar")}</Link>} />

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => chamar(() => alternarFornecedor(id))}>
          {ativo ? t("desativar") : t("reativar")}
        </DropdownMenuItem>

        {/* Excluir só aparece quando não há nada a perder. */}
        {podeExcluir && !temHistorico && (
          <DropdownMenuItem
            onClick={() => {
              if (!confirm(t("confirmarExcluir"))) return
              chamar(() => excluirFornecedor(id))
            }}
            className="text-destructive"
          >
            {t("excluir")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
