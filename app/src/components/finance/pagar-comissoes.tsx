"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { pagarComissoesDe } from "@/actions/finance"
import { formatCurrency } from "@/lib/utils"

// Pagar de uma vez todas as comissões pendentes de uma pessoa.
//
// ─── Por que confirma antes ──────────────────────────────────────────────────
//
// Um clique passa a mover o mês inteiro de alguém. A confirmação não é
// burocracia: ela mostra QUANTAS e QUANTO, que é a última chance de a pessoa
// ver um zero a mais antes de o dinheiro sair. É também a única defesa contra
// o clique errado na linha errada — as linhas ficam uma embaixo da outra.

export function PagarComissoes({
  payeeId,
  nome,
  quantidade,
  total,
}: {
  payeeId: string
  nome: string
  quantidade: number
  total: number
}) {
  const t = useTranslations("finance.comissoes")
  const [pendente, iniciar] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (confirmando) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          {t("confirmarPagamento", { n: quantidade, valor: formatCurrency(total), nome })}
        </span>
        <Button
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await pagarComissoesDe(payeeId)
              if (r?.erro) setErro(r.erro)
              setConfirmando(false)
            })
          }
        >
          {pendente && <Loader2 className="size-3.5 animate-spin" />}
          {t("confirmar")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pendente} onClick={() => setConfirmando(false)}>
          {t("cancelar")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {erro && <span className="text-xs text-destructive">{t(`erros.${erro}` as "erros.semPermissao")}</span>}
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(true)}>
        <Wallet className="size-3.5" />
        {t("pagarTodas")}
      </Button>
    </div>
  )
}
