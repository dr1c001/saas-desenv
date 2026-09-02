"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fecharCotacao } from "@/actions/cotacao"

// Fechar a cotação com um fornecedor, gerando a ordem de compra.
//
// O ponto da funcionalidade inteira está aqui: o preço que o fornecedor deu
// vira o preço da ordem, sem redigitação — e portanto sem a chance de digitar
// errado justamente o número que se acabou de comparar.
//
// A compra nasce em RASCUNHO. Fechar a cotação é decidir de quem comprar, não
// é mandar o pedido.

export function FecharCotacaoButton({
  quotationId,
  participantId,
}: {
  quotationId: string
  participantId: string
}) {
  const t = useTranslations("cotacoes")
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await fecharCotacao(quotationId, participantId)
          if (r.erro) alert(t(`erros.${r.erro}` as "erros.semPermissao"))
          // Vai direto para a compra criada: é o próximo passo real, e deixar
          // a pessoa procurá-la na lista seria um passo inventado.
          else if (r.id) router.push(`/purchases/${r.id}`)
        })
      }
    >
      {pendente ? (
        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
      ) : (
        <Check className="size-3.5 mr-1.5" />
      )}
      {t("fecharCom")}
    </Button>
  )
}
