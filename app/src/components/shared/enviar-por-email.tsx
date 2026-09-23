"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

// O botão de mandar o documento para o cliente, usado pelo orçamento e pela OS.
//
// Um componente só para os dois porque a diferença entre eles é o texto e a
// ação — e duas cópias seriam duas chances de uma delas parar de mostrar o
// erro, que é justamente a parte que importa aqui.
//
// ─── O erro é a razão de este componente existir ─────────────────────────────
//
// Enviar e-mail falha por motivos comuns e chatos: o cliente não tem e-mail
// cadastrado, o endereço está torto, o provedor recusou. Hoje o aviso ao
// cliente sobre a OS falha em SILÊNCIO — sem e-mail, a função simplesmente
// retorna. Aqui a pessoa clicou de propósito e está esperando; sumir com a
// resposta é a pior coisa que dá para fazer.

type Resultado = { erro?: string; ok?: boolean; destino?: string }

export function EnviarPorEmail({
  enviar,
  jaEnviadoPara,
  jaEnviadoEm,
  desabilitado,
}: {
  enviar: () => Promise<Resultado>
  /** Para quem já foi, se já foi. */
  jaEnviadoPara?: string | null
  jaEnviadoEm?: Date | string | null
  /** Motivo para nem oferecer o botão — ex.: OS ainda não assinada. */
  desabilitado?: string | null
}) {
  const t = useTranslations("envioPorEmail")
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const jaFoi = jaEnviadoPara && jaEnviadoEm
  const quando = jaEnviadoEm
    ? new Date(jaEnviadoEm).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente || !!desabilitado}
        title={desabilitado ?? undefined}
        onClick={() =>
          iniciar(async () => {
            setResultado(null)
            setResultado(await enviar())
          })
        }
      >
        {pendente ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {jaFoi ? t("reenviar") : t("enviar")}
      </Button>

      {/* Por que o botão não serve agora. Um botão apagado sem explicação faz
          a pessoa achar que o sistema quebrou. */}
      {desabilitado && <p className="text-xs text-muted-foreground">{desabilitado}</p>}

      {resultado?.ok && (
        <p className="text-xs text-emerald-600">{t("enviado", { destino: resultado.destino ?? "" })}</p>
      )}
      {resultado?.erro && (
        <p className="text-sm text-destructive">
          {t(`erros.${resultado.erro}` as "erros.semEmail")}
        </p>
      )}

      {/* O registro do envio anterior, para não mandar duas vezes sem saber. */}
      {jaFoi && !resultado && (
        <p className="text-xs text-muted-foreground">
          {t("jaEnviado", { destino: jaEnviadoPara, quando: quando ?? "" })}
        </p>
      )}
    </div>
  )
}
