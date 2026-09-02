"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { criarCompraSugerida } from "@/actions/compras"

// "Compre o que está faltando."
//
// O sistema já sabia o que está abaixo do mínimo — o alerta da tela de peças
// usa a mesma informação todo dia. O que faltava era transformar isso numa
// ordem de compra, em vez de o dono somar à mão o que precisa pedir.
//
// Cria em RASCUNHO de propósito: ele ainda vai escolher o fornecedor, conferir
// as quantidades e negociar o preço. Criar já enviada seria o sistema comprando
// sozinho.

export function SugestaoButton({ quantasFaltam }: { quantasFaltam: number }) {
  const t = useTranslations("compras")
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  // Sem nada faltando, o botão não tem o que fazer — e um botão que não faz
  // nada ensina a pessoa a ignorá-lo.
  if (quantasFaltam === 0) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await criarCompraSugerida()
          if (r.erro) alert(t(`erros.${r.erro}` as "erros.semPermissao"))
          else if (r.id) router.push(`/purchases/${r.id}`)
        })
      }
    >
      {pendente ? (
        <Loader2 className="size-4 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="size-4 mr-1.5" />
      )}
      {t("sugerir", { n: quantasFaltam })}
    </Button>
  )
}
