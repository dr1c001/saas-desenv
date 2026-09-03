"use client"

import { useState, useTransition } from "react"
import { BellRing, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { testarAvisoDaPlataforma } from "@/actions/admin"

// O botão que prova que o cano está de pé.
//
// ─── Por que ele existe ──────────────────────────────────────────────────────
//
// O modo de falha deste recurso é o SILÊNCIO. Se a inscrição do aparelho
// morreu, se a chave VAPID mudou, se o navegador revogou a permissão — nada
// acusa. E com quatro empresas cadastradas na história inteira, pode levar
// meses até um gatilho de verdade revelar que ninguém está sendo avisado.
//
// Um clique responde: chegou ou não chegou.

export function TestarAviso() {
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await testarAvisoDaPlataforma()
            // Números crus de propósito: esta tela é do dono da plataforma, e
            // "1 aparelho" responde a pergunta melhor que "enviado com
            // sucesso" — que é o que se diz quando não se sabe.
            setResultado(
              r.erro
                ? r.erro
                : `${r.enviadas} aparelho(s) · ${r.falharam} falha(s) · ${r.removidas} inscrição(ões) morta(s) removida(s)`
            )
          })
        }
      >
        {pendente ? (
          <Loader2 className="size-4 mr-1.5 animate-spin" />
        ) : (
          <BellRing className="size-4 mr-1.5" />
        )}
        Testar aviso
      </Button>
      {resultado && <span className="text-xs text-muted-foreground">{resultado}</span>}
    </span>
  )
}
