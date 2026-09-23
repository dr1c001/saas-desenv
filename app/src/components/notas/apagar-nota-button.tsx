"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apagarNota } from "@/actions/notas-compra"

// Remover nota é remover documento contábil — por isso confirma, e por isso a
// mensagem diz o que se perde em vez de perguntar "tem certeza?".

export function ApagarNotaButton({ notaId }: { notaId: string }) {
  const t = useTranslations("notasCompra")
  const [pendente, iniciar] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pendente}
      title={t("remover")}
      onClick={() => {
        if (!confirm(t("confirmarRemover"))) return
        iniciar(async () => {
          const r = await apagarNota(notaId)
          if (r?.erro) alert(t(`erros.${r.erro}` as "erros.semPermissao"))
        })
      }}
    >
      {pendente ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  )
}
