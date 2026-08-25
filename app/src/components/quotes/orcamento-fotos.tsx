"use client"

import { Fotos } from "@/components/shared/fotos"
import {
  apagarFotoDoOrcamento,
  enviarFotoDoOrcamento,
  type FotoExibicao,
} from "@/actions/attachments"

/** As fotos do orçamento. Casca fina sobre o componente comum — o que ela
 *  acrescenta é AMARRAR as ações do orçamento, e mais nada. */
export function OrcamentoFotos({
  quoteId,
  fotos,
  podeApagar,
  bloqueado,
}: {
  quoteId: string
  fotos: FotoExibicao[]
  podeApagar: boolean
  /** Orçamento já aprovado ou recusado: as fotos fazem parte do que o cliente
   *  viu para decidir, e trocar depois mudaria o documento que sustenta a
   *  resposta dele. */
  bloqueado: boolean
}) {
  return (
    <Fotos
      campo="quoteId"
      donoId={quoteId}
      fotos={fotos}
      podeApagar={podeApagar}
      bloqueada={bloqueado}
      enviar={enviarFotoDoOrcamento}
      apagar={apagarFotoDoOrcamento}
    />
  )
}
