"use client"

import { useSyncExternalStore } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

// O botão "Instalar painel".
//
// ─── Por que o evento é capturado no <head>, e não aqui ──────────────────────
//
// O `beforeinstallprompt` é disparado UMA VEZ, cedo, e o navegador não o repete.
// Se ninguém estiver escutando quando ele chega, ele se perde — e a hidratação
// do React acontece depois. Por isso um script no layout guarda o evento em
// `window.__promptPainel` e avisa por um evento próprio.
//
// ─── Por que useSyncExternalStore ────────────────────────────────────────────
//
// O estado real não é do React: é uma variável no `window` que o navegador
// preenche quando quer. Ler com useEffect + setState significa chamar setState
// no primeiro render — o que o lint acusa como render em cascata, e com razão:
// o valor JÁ existe quando o componente monta, e a versão com efeito pinta uma
// vez sem o botão antes de pintar com ele.

type PromptDeInstalacao = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

declare global {
  interface Window {
    __promptPainel?: PromptDeInstalacao
  }
}

const EVENTOS = ["painel:instalavel", "appinstalled"] as const

function assinar(avisar: () => void) {
  for (const e of EVENTOS) window.addEventListener(e, avisar)
  return () => {
    for (const e of EVENTOS) window.removeEventListener(e, avisar)
  }
}

function agora(): boolean {
  // Já instalado: a janela abre em modo standalone e o botão não tem sentido.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return false
  return window.__promptPainel != null
}

/** No servidor não há navegador para perguntar — e é o mesmo do primeiro render. */
const noServidor = () => false

export function InstalarPainel({ rotulo }: { rotulo: string }) {
  const disponivel = useSyncExternalStore(assinar, agora, noServidor)

  if (!disponivel) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        const evento = window.__promptPainel
        if (!evento) return
        await evento.prompt()
        await evento.userChoice
        // O evento só pode ser usado UMA vez: chamar de novo lança, e o botão
        // ficaria ali prometendo algo que não acontece mais.
        window.__promptPainel = undefined
        // Avisa a própria loja, senão a tela só mudaria no próximo evento do
        // navegador — que pode não vir nunca.
        window.dispatchEvent(new Event("painel:instalavel"))
      }}
    >
      <Download className="size-4 mr-1.5" />
      {rotulo}
    </Button>
  )
}
