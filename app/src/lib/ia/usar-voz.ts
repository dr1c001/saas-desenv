"use client"

// Ouvir e falar, usando o que o próprio navegador já tem.
//
// Sem serviço de transcrição pago: o reconhecimento de fala do navegador
// resolve o caso de uso e não acrescenta custo por minuto ao custo por token
// que a assistente já tem.
//
// ─── O que isso NÃO é ────────────────────────────────────────────────────────
//
// Não é processamento no aparelho. O Chrome ENVIA O ÁUDIO para servidores do
// Google para transcrever. É uma consideração de privacidade menor que mandar
// ficha de cliente para um modelo, mas existe, e quem escreve a política de
// privacidade precisa saber.
//
// Também não funciona em todo lugar: o suporte é bom no Chrome e no Android, e
// irregular no Firefox e no iOS. Por isso `suportado` é devolvido — a tela tem
// de esconder o microfone onde ele não vai funcionar, em vez de oferecer um
// botão que não faz nada.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

// O tipo mínimo do que usamos. A API não está no lib do TypeScript porque
// nunca saiu de rascunho — o que também explica o suporte irregular.
type Reconhecimento = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type ComReconhecimento = {
  SpeechRecognition?: new () => Reconhecimento
  webkitSpeechRecognition?: new () => Reconhecimento
}

function construtor(): (new () => Reconhecimento) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as ComReconhecimento
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** O suporte do navegador não muda durante a sessão: nada para assinar. */
function naoMuda(): () => void {
  return () => {}
}

export type EstadoDaVoz = {
  suportado: boolean
  ouvindo: boolean
  /** O que foi entendido até agora, incluindo o palpite parcial. */
  texto: string
  erro: string | null
  ouvir: () => void
  parar: () => void
  limpar: () => void
}

/**
 * Ouve, e devolve o que foi dito.
 *
 * `onFinal` dispara quando a pessoa PARA de falar. É esse o gatilho para
 * mandar o comando — esperar um botão de "enviar" derrubaria a razão de ser da
 * coisa, que é não precisar da mão.
 */
// Prefixo `use` em nome português: é a convenção que o projeto já usa em
// usar-fila-offline.ts (arquivo em português, hook `useFilaOffline`). O
// prefixo não é estilo — é o que faz o ESLint reconhecer as regras de hook.
export function useVoz(onFinal?: (texto: string) => void, idioma = "pt-BR"): EstadoDaVoz {
  const [ouvindo, setOuvindo] = useState(false)
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  // Via useSyncExternalStore, e não estado com efeito: `construtor()` toca em
  // `window`, que não existe no servidor. Um valor inicial calculado daria
  // divergência de hidratação; um setState em efeito faria a tela piscar de
  // "sem microfone" para "com microfone". O snapshot de servidor é `false`,
  // que é a verdade lá. Mesmo padrão do banner offline.
  const suportado = useSyncExternalStore(
    naoMuda,
    () => construtor() !== null,
    () => false
  )
  const motor = useRef<Reconhecimento | null>(null)
  // O callback num ref: se ele entrasse nas dependências do efeito, cada
  // render remontaria o motor e cortaria a fala no meio.
  const aoFinal = useRef(onFinal)
  // Sincronizado num efeito, e não durante o render: mexer em ref no render é
  // proibido no React 19 — o render pode acontecer mais de uma vez e ser
  // descartado, e a escrita ficaria de pé mesmo assim.
  useEffect(() => {
    aoFinal.current = onFinal
  })

  useEffect(() => {
    const C = construtor()
    if (!C) return

    const r = new C()
    r.lang = idioma
    // `continuous: false` de propósito: um comando por vez. Escuta contínua
    // num celular no bolso capta conversa de obra inteira e manda tudo para um
    // modelo que cobra por token.
    r.continuous = false
    r.interimResults = true

    r.onresult = (e) => {
      let junto = ""
      for (let i = 0; i < e.results.length; i++) junto += e.results[i][0].transcript
      setTexto(junto)
    }
    r.onerror = (e) => {
      // "aborted" é o que sai quando a própria tela manda parar. Mostrar isso
      // como erro assustaria à toa.
      if (e.error !== "aborted") setErro(e.error)
      setOuvindo(false)
    }
    r.onend = () => {
      setOuvindo(false)
      setTexto((t) => {
        const limpo = t.trim()
        if (limpo) aoFinal.current?.(limpo)
        return limpo
      })
    }

    motor.current = r
    return () => {
      r.onend = null
      r.onerror = null
      r.onresult = null
      r.abort()
      motor.current = null
    }
  }, [idioma])

  const ouvir = useCallback(() => {
    if (!motor.current) return
    setErro(null)
    setTexto("")
    try {
      motor.current.start()
      setOuvindo(true)
    } catch {
      // start() com o motor já rodando lança. Não é erro para a pessoa ver.
    }
  }, [])

  const parar = useCallback(() => motor.current?.stop(), [])
  const limpar = useCallback(() => setTexto(""), [])

  return { suportado, ouvindo, texto, erro, ouvir, parar, limpar }
}

/**
 * Fala a resposta em voz alta.
 *
 * Quem está com as mãos ocupadas também está com os olhos ocupados. Uma
 * assistente de voz que só escreve resolve metade do problema.
 */
export function falar(texto: string, idioma = "pt-BR"): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  // Cancela o que estiver falando: duas respostas sobrepostas não se entende.
  window.speechSynthesis.cancel()
  const fala = new SpeechSynthesisUtterance(texto)
  fala.lang = idioma
  window.speechSynthesis.speak(fala)
}

/** Cala a boca. Usado ao fechar o painel — voz continuando sozinha depois de
 *  fechar é das coisas mais irritantes que uma interface faz. */
export function calar(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel()
}
