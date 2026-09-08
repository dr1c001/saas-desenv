"use client"

import { Fotos } from "@/components/shared/fotos"
import {
  apagarFotoDaOs,
  enviarFotoDaOs,
  type FotoExibicao,
} from "@/actions/attachments"

/** As fotos da OS. Casca fina sobre o componente comum — o que ela acrescenta
 *  e AMARRAR as acoes da OS, e mais nada. */
export function OsFotos({
  orderId,
  fotos,
  podeApagar,
  bloqueada,
}: {
  orderId: string
  fotos: FotoExibicao[]
  podeApagar: boolean
  bloqueada: boolean
}) {
  return (
    <Fotos
      campo="orderId"
      donoId={orderId}
      fotos={fotos}
      podeApagar={podeApagar}
      bloqueada={bloqueada}
      enviar={enviarFotoDaOs}
      apagar={apagarFotoDaOs}
    />
  )
}
