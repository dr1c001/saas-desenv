"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { gerarOrcamentoDaOs } from "@/actions/os-orcamento"
import { situacaoDaVisita, type StatusOrcamento } from "@/lib/os-orcamento"

// O orçamento que saiu desta visita.
//
// O caso: o cliente chama, o técnico vai até o endereço, e no local o cliente
// só quer saber quanto custa. Este bloco é os dois lados disso — gerar a
// proposta a partir do que já está na tela, e depois mostrar em que pé ela
// está sem obrigar ninguém a sair da OS para descobrir.

const COR: Record<string, string> = {
  aguardando: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  recusado: "bg-red-500/15 text-red-700 dark:text-red-300",
}

export function OrcamentoDaVisita({
  orderId,
  statusDaOs,
  orcamento,
  taxaDeVisita,
  podeGerar,
}: {
  orderId: string
  statusDaOs: string
  /** O orçamento vinculado, quando já existe. */
  orcamento: { id: string; number: number; status: StatusOrcamento; amount: number } | null
  /** O que a empresa cobra pela visita quando o cliente recusa. */
  taxaDeVisita: number
  /** Só dono e administrador geram proposta comercial. */
  podeGerar: boolean
}) {
  const t = useTranslations("orcamentoDaVisita")
  const [pendente, iniciar] = useTransition()
  const situacao = situacaoDaVisita(orcamento?.status)

  // Sem orçamento e sem permissão de gerar, o bloco não tem o que dizer.
  if (!orcamento && !podeGerar) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" />
          {t("titulo")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {!orcamento ? (
          <>
            <p className="text-sm text-muted-foreground">{t("explicacao")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendente || statusDaOs === "CANCELLED" || statusDaOs === "INVOICED"}
              onClick={() =>
                iniciar(async () => {
                  const r = await gerarOrcamentoDaOs(orderId)
                  // A ação redireciona quando dá certo; só o erro volta.
                  if (r?.erro) alert(t(`errors.${r.erro}` as "errors.semPermissao"))
                })
              }
            >
              {pendente && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {t("gerar")}
            </Button>
            {(statusDaOs === "CANCELLED" || statusDaOs === "INVOICED") && (
              <p className="text-xs text-muted-foreground">{t("errors.statusNaoPermite")}</p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/quotes/${orcamento.id}`}
                className="font-mono text-sm font-semibold underline-offset-4 hover:underline"
              >
                #{String(orcamento.number).padStart(4, "0")}
              </Link>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR[situacao] ?? ""}`}
              >
                {t(`situacao.${situacao}` as "situacao.aguardando")}
              </span>
            </div>

            {/* O que isso significa para o dinheiro da OS. É a pergunta que a
                pessoa está fazendo ao olhar este bloco na hora de fechar. */}
            <p className="text-sm text-muted-foreground">
              {situacao === "recusado"
                ? taxaDeVisita > 0
                  ? t("recusadoComTaxa", { valor: taxaDeVisita.toFixed(2).replace(".", ",") })
                  : t("recusadoSemTaxa")
                : situacao === "aguardando"
                  ? t("aguardandoAviso")
                  : t("aprovadoAviso")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
