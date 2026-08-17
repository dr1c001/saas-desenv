"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Pause, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { alternarContrato, excluirContrato } from "@/actions/contracts"

export function ContractRowActions({
  id,
  ativo,
  osGeradas,
}: {
  id: string
  ativo: boolean
  osGeradas: number
}) {
  const t = useTranslations("contratos")
  const [pendente, start] = useTransition()

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label={ativo ? t("pause") : t("resume")}
        onClick={() => start(() => { alternarContrato(id) })}
      >
        {ativo ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        <span className="ml-1.5 hidden sm:inline">{ativo ? t("pause") : t("resume")}</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label={t("delete")}
        onClick={() => {
          // O aviso muda conforme já houve trabalho: apagar um contrato que
          // gerou 40 OS não apaga as OS, e quem clica precisa saber disso
          // antes, não depois.
          const msg = osGeradas > 0 ? t("confirmDeleteWithOrders", { count: osGeradas }) : t("confirmDelete")
          if (confirm(msg)) start(() => { excluirContrato(id) })
        }}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  )
}
