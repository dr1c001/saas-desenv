"use client"

import { useActionState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { fecharDuvida, responderDuvida, type EstadoResposta } from "@/actions/admin-duvidas"
import { MAX_CARACTERES } from "@/lib/duvida"

const MENSAGEM: Record<string, string> = {
  vazio: "Escreva a resposta.",
  curto: "Escreva um pouco mais.",
  longo: `Máximo de ${MAX_CARACTERES} caracteres.`,
  conversaCheia: "Esta conversa atingiu o limite de mensagens. Vale ligar para o cliente.",
  naoEncontrado: "Dúvida não encontrada.",
}

export function ResponderDuvida({ id, fechada }: { id: string; fechada: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [estado, formAction, enviando] = useActionState<EstadoResposta, FormData>(
    responderDuvida.bind(null, id),
    {}
  )

  if (estado.ok) setTimeout(() => router.refresh(), 0)

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-2">
        <Textarea
          name="texto"
          rows={4}
          required
          maxLength={MAX_CARACTERES}
          placeholder="Sua resposta para o cliente..."
        />
        {estado.erro && (
          <p className="text-sm text-destructive">{MENSAGEM[estado.erro] ?? estado.erro}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={enviando}>
            {enviando ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="size-4 mr-1.5" />
            )}
            Responder
          </Button>
          {!fechada && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  await fecharDuvida(id)
                  router.refresh()
                })
              }
            >
              <CheckCircle2 className="size-4 mr-1.5" />
              Encerrar
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        O cliente recebe um aviso no celular assim que você responder. Encerrar não impede
        que ele escreva de novo — se voltar, a conversa reabre com todo o histórico.
      </p>
    </div>
  )
}
