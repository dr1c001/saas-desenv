"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { updateTeamMemberRole, removeTeamMember, reenviarConvite } from "@/actions/team"
import { Pencil, Send, Trash2 } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CARGOS_ATRIBUIVEIS } from "@/lib/cargos"

type Props = {
  memberId: string
  memberName: string
  currentRole: string
  /** A linha de quem está olhando. */
  ehVoce: boolean
}

export function TeamRowActions({ memberId, memberName, currentRole, ehVoce }: Props) {
  const [isPending, startTransition] = useTransition()
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)
  const t = useTranslations("team.rowActions")
  const tc = useTranslations("common")

  if (currentRole === "OWNER") return null

  function handleRoleChange(role: string | null) {
    if (!role || role === currentRole) return
    startTransition(() => updateTeamMemberRole(memberId, role))
  }

  function handleRemove() {
    if (!confirm(t("confirmRemove"))) return
    startTransition(() => removeTeamMember(memberId))
  }

  function handleResend() {
    if (!confirm(t("confirmResend", { name: memberName }))) return
    setAviso(null)
    startTransition(async () => {
      const r = await reenviarConvite(memberId)
      setAviso({ texto: r.message ?? "", ok: Boolean(r.success) })
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {aviso && (
        <span
          className={`text-xs mr-1 max-w-52 ${aviso.ok ? "text-green-700" : "text-destructive"}`}
        >
          {aviso.texto}
        </span>
      )}
      {/* Na sua própria linha, cargo e remoção ficam DESLIGADOS. As duas
          Actions já recusavam (`memberId === userId`) e voltavam caladas: os
          controles apareciam, a pessoa usava, e nada acontecia. É o mesmo
          "a tela promete e o código recusa" que esta aba veio corrigir — em
          miniatura. Editar continua valendo: cada um corrige o próprio nome e
          telefone. */}
      <Select
        defaultValue={currentRole}
        onValueChange={handleRoleChange}
        disabled={isPending || ehVoce}
      >
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Montado a partir do catálogo, igual à tela de convite.
              Ficaram presos aqui ADMIN e TECHNICIAN de quando o sistema tinha
              três cargos; desde 24/08/2026 são oito, e a tela de convite já
              distribuía todos. O resultado era um gerente ou um financeiro
              convidado corretamente cuja linha mostrava o cargo em BRANCO —
              nenhum item do Select batia com o valor — e que só podia ser
              rebaixado a técnico ou promovido a administrador. */}
          {CARGOS_ATRIBUIVEIS.map((c) => (
            <SelectItem key={c} value={c}>
              {tc(`roles.${c}` as "roles.ADMIN")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        href={`/team/${memberId}/edit`}
        aria-label={t("edit")}
        title={t("edit")}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent"
      >
        <Pencil className="size-3.5" />
      </Link>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={handleResend}
        disabled={isPending || ehVoce}
        aria-label={t("resend")}
        title={t("resend")}
      >
        <Send className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive hover:text-destructive h-8 w-8"
        onClick={handleRemove}
        disabled={isPending || ehVoce}
        aria-label={tc("delete")}
        title={tc("delete")}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
