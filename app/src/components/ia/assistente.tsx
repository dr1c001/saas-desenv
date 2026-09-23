"use client"

// O painel da assistente de voz.
//
// Botão flutuante, presente em toda tela do painel. Fica flutuante e não na
// barra lateral de propósito: quem usa isto está com as mãos ocupadas no meio
// de um serviço, e alcançar um alvo grande num canto fixo é bem mais fácil que
// achar um item de menu.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AlertTriangle, Loader2, Mic, Square, X } from "lucide-react"
import {
  cancelarPendente,
  confirmarPendente,
  estadoDaAssistente,
  falarComAssistente,
  type Pendente,
  type RespostaDaAssistente,
} from "@/actions/ia"
import { codigoDaTelaAtual } from "@/lib/codigos-abas"
import { calar, falar, useVoz } from "@/lib/ia/usar-voz"
import { Button } from "@/components/ui/button"

type Fala = { de: "pessoa" | "assistente"; texto: string }

export function Assistente() {
  const t = useTranslations("assistente")
  const tc = useTranslations("common")
  const router = useRouter()
  const pathname = usePathname()

  const [aberto, setAberto] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [conversa, setConversa] = useState<Fala[]>([])
  const [aConfirmar, setAConfirmar] = useState<{ frase: string; pendente: Pendente } | null>(null)
  const [impedida, setImpedida] = useState<string | null>(null)
  const [restam, setRestam] = useState<number | null>(null)
  const [disponivel, setDisponivel] = useState(false)
  // O histórico da conversa fica num ref: ele muda a cada volta e não desenha
  // nada, então não precisa provocar render.
  const historico = useRef<Parameters<typeof falarComAssistente>[0]>([])

  useEffect(() => {
    estadoDaAssistente()
      .then((e) => {
        setDisponivel(e.disponivel)
        setRestam(e.restam)
        if (!e.disponivel && e.motivo) setImpedida(e.motivo)
      })
      // Falhar aqui só significa que o botão não aparece. Não vale quebrar a
      // tela inteira do painel por causa da assistente.
      .catch(() => setDisponivel(false))
  }, [])

  const tratar = useCallback(
    (r: RespostaDaAssistente) => {
      if (r.tipo === "impedida") {
        setImpedida(r.motivo)
        return
      }
      if (r.tipo === "confirmar") {
        setAConfirmar({ frase: r.frase, pendente: r.pendente })
        // A confirmação também é falada: quem está de mãos ocupadas precisa
        // OUVIR o que vai acontecer, senão a barreira não protege ninguém.
        falar(r.frase)
        return
      }
      historico.current = r.historico
      setRestam(r.restam)
      setConversa((c) => [...c, { de: "assistente", texto: r.texto }])
      falar(r.texto)
      if (r.abrir) router.push(r.abrir)
    },
    [router]
  )

  const enviar = useCallback(
    async (texto: string) => {
      setConversa((c) => [...c, { de: "pessoa", texto }])
      setPensando(true)
      try {
        const codigo = codigoDaTelaAtual(pathname)
        tratar(await falarComAssistente(historico.current, texto, codigo ?? undefined))
      } catch {
        setConversa((c) => [...c, { de: "assistente", texto: t("falhou") }])
      } finally {
        setPensando(false)
      }
    },
    [pathname, tratar, t]
  )

  const voz = useVoz(enviar)

  function fechar() {
    calar()
    voz.parar()
    setAberto(false)
  }

  async function responder(confirmou: boolean) {
    if (!aConfirmar) return
    const p = aConfirmar.pendente
    setAConfirmar(null)
    setPensando(true)
    try {
      tratar(confirmou ? await confirmarPendente(p) : await cancelarPendente(p))
    } catch {
      setConversa((c) => [...c, { de: "assistente", texto: t("falhou") }])
    } finally {
      setPensando(false)
    }
  }

  // Sem recurso contratado, nem botão aparece: oferecer e mandar para a tela de
  // planos ao clicar é propaganda disfarçada de funcionalidade.
  if (!disponivel && impedida === "semRecurso") return null
  if (!disponivel && impedida === null) return null

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        aria-label={t("abrir")}
        className="fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Mic className="size-6" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{t("titulo")}</span>
          {restam !== null && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t("restam", { n: restam })}
            </span>
          )}
        </div>
        <button onClick={fechar} aria-label={tc("close")} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {conversa.length === 0 && !impedida && (
          <p className="text-muted-foreground">{t("comoUsar")}</p>
        )}

        {conversa.map((f, i) => (
          <p
            key={i}
            className={
              f.de === "pessoa"
                ? "ml-auto w-fit max-w-[85%] rounded-lg bg-muted px-3 py-1.5"
                : "max-w-[95%]"
            }
          >
            {f.texto}
          </p>
        ))}

        {voz.ouvindo && voz.texto && <p className="ml-auto w-fit italic text-muted-foreground">{voz.texto}</p>}
        {pensando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

        {impedida && (
          <div className="flex gap-2 rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p>{t(`impedida.${impedida}` as "impedida.semChave")}</p>
          </div>
        )}

        {voz.erro && !impedida && <p className="text-destructive">{t("naoOuvi")}</p>}
      </div>

      {/* A confirmação do que não se desfaz. Fica ACIMA do microfone, ocupando
          a largura toda: é a única coisa na tela que a pessoa precisa ler antes
          de continuar. */}
      {aConfirmar && (
        <div className="space-y-2 border-t bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium">{aConfirmar.frase}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => responder(true)}>
              {t("confirmar")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => responder(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}

      {!aConfirmar && !impedida && (
        <footer className="flex items-center gap-3 border-t px-4 py-3">
          {voz.suportado ? (
            <Button
              size="sm"
              variant={voz.ouvindo ? "destructive" : "default"}
              onClick={voz.ouvindo ? voz.parar : voz.ouvir}
              disabled={pensando}
            >
              {voz.ouvindo ? <Square className="size-4 mr-1" /> : <Mic className="size-4 mr-1" />}
              {voz.ouvindo ? t("parar") : t("falar")}
            </Button>
          ) : (
            // Navegador sem reconhecimento de fala (Firefox, iOS): melhor
            // digitar do que oferecer um microfone que não faz nada.
            <p className="text-xs text-muted-foreground">{t("semMicrofone")}</p>
          )}
          <CampoDigitado aoEnviar={enviar} desabilitado={pensando} rotulo={t("digitar")} />
        </footer>
      )}
    </div>
  )
}

/** O caminho de teclado. Existe porque em obra barulhenta o reconhecimento
 *  falha, e porque nem todo navegador tem microfone disponível. */
function CampoDigitado({
  aoEnviar,
  desabilitado,
  rotulo,
}: {
  aoEnviar: (t: string) => void
  desabilitado: boolean
  rotulo: string
}) {
  const [texto, setTexto] = useState("")
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !texto.trim()) return
        aoEnviar(texto.trim())
        setTexto("")
      }}
      placeholder={rotulo}
      aria-label={rotulo}
      disabled={desabilitado}
      className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
    />
  )
}
