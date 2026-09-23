"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { definirBaseDaComissao, definirPagamentoEmLote } from "@/actions/finance"

// Sobre o que a comissão incide: o total da OS, ou só a mão de obra.
//
// Fica DENTRO do cartão de comissões, e não na tela de configurações: é aqui
// que o dono está olhando os números que este botão muda, e é aqui que a
// pergunta "por que a Ana recebeu R$ 120 numa OS que era quase toda peça?"
// aparece na cabeça dele.

export function BaseDaComissao({ atual, emLote }: { atual: string; emLote: boolean }) {
  const t = useTranslations("finance.comissoes")
  const [base, setBase] = useState(atual)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [lote, setLote] = useState(emLote)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor="baseComissao" className="text-muted-foreground">
        {t("baseLabel")}
      </label>
      <select
        id="baseComissao"
        value={base}
        disabled={pendente}
        className="h-8 rounded-md border bg-transparent px-2 text-xs"
        onChange={(e) => {
          const nova = e.target.value
          const anterior = base
          setBase(nova)
          setErro(null)
          iniciar(async () => {
            const r = await definirBaseDaComissao(nova)
            // Volta ao valor anterior quando o servidor recusa: deixar o
            // <select> mostrando a opção nova daria a entender que ela pegou.
            if (r?.erro) {
              setBase(anterior)
              setErro(r.erro)
            }
          })
        }}
      >
        <option value="TOTAL">{t("baseTotal")}</option>
        <option value="MAO_DE_OBRA">{t("baseMaoDeObra")}</option>
      </select>
      {pendente && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {erro && <span className="text-destructive">{t(`erros.${erro}` as "erros.semPermissao")}</span>}

      {/* Pagar em lote: opção, e não padrão fixo. Um clique passa a mover o mês
          inteiro de alguém, e quem prefere conferir OS a OS desliga. */}
      <label className="ml-2 flex items-center gap-1.5 text-muted-foreground">
        <input
          type="checkbox"
          checked={lote}
          disabled={pendente}
          onChange={(e) => {
            const novo = e.target.checked
            const anterior = lote
            setLote(novo)
            iniciar(async () => {
              const r = await definirPagamentoEmLote(novo)
              if (r?.erro) {
                setLote(anterior)
                setErro(r.erro)
              }
            })
          }}
        />
        {t("pagarEmLoteLabel")}
      </label>
    </div>
  )
}
