"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"

// Caixa ou competência.
//
// ─── Por que os dois, e por que caixa continua sendo o padrão ────────────────
//
// Não é que caixa esteja errado. "Quanto entrou e quanto saiu neste mês" é a
// pergunta que decide se dá para comprar a van, e essa pergunta é de caixa.
//
// Competência responde outra: "este mês deu lucro?". As duas são legítimas e
// dão números diferentes de propósito. O que estava errado era existir só uma e
// ela ser apresentada como se respondesse as duas.
//
// Caixa segue como padrão porque trocar faria todos os meses que o dono já
// conferiu mudarem de valor de um dia para o outro, sem ele ter pedido.

export function RegimePicker({ atual }: { atual: string }) {
  const t = useTranslations("finance.reports.regime")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, iniciar] = useTransition()

  function trocar(valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    // "caixa" é o padrão do servidor; deixá-lo fora da URL mantém o endereço
    // limpo e faz o link compartilhado significar a mesma coisa.
    if (valor === "caixa") params.delete("regime")
    else params.set("regime", valor)
    iniciar(() => router.replace(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border p-0.5" role="group">
        {(["caixa", "competencia"] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={pendente}
            onClick={() => trocar(r)}
            className={`rounded px-2.5 py-1 text-xs ${
              atual === r ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {t(r)}
          </button>
        ))}
      </div>
      {/* O que cada um responde, em uma linha. Sem isto o dono troca, vê outro
          número e não sabe qual dos dois acreditar — que é pior do que ter só
          um número errado. */}
      <p className="text-xs text-muted-foreground">
        {atual === "competencia" ? t("explicaCompetencia") : t("explicaCaixa")}
      </p>
    </div>
  )
}
