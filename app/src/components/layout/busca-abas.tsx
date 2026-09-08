"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CornerDownLeft, Search } from "lucide-react"
import {
  destinosPermitidos,
  destinosPorCodigo,
  DESTINOS,
  pareceCodigo,
  type Destino,
} from "@/lib/codigos-abas"
import { cn } from "@/lib/utils"

/**
 * A barra que leva a qualquer tela pelo NÚMERO — ou pelo nome.
 *
 * A ideia é a de um menu de PABX: quem usa o sistema todo dia decora "1.1" e
 * chega mais rápido do que caçando na barra lateral. Mas aceitar só número
 * seria um atalho para ninguém — quem não decorou digita "orça" e acha
 * Orçamentos do mesmo jeito.
 *
 * Só aparece o que a pessoa PODE abrir. Esconder não é proteção (a rota se
 * defende sozinha e a URL sempre foi digitável), mas oferecer um atalho que
 * leva a uma tela que redireciona de volta é pior que não oferecer atalho.
 */
export function BuscaAbas({
  abasPermitidas,
  ehAdmin,
}: {
  abasPermitidas: string[]
  ehAdmin: boolean
}) {
  const t = useTranslations("nav")
  const tb = useTranslations("buscaAbas")
  const router = useRouter()
  const [texto, setTexto] = useState("")
  const [foco, setFoco] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  const disponiveis = useMemo(
    () => destinosPermitidos(DESTINOS, abasPermitidas, ehAdmin),
    [abasPermitidas, ehAdmin]
  )

  const achados = useMemo((): Destino[] => {
    const q = texto.trim()
    if (!q) return []

    if (pareceCodigo(q)) {
      const porCodigo = destinosPorCodigo(q)
      return porCodigo.filter((d) => disponiveis.includes(d))
    }

    // Por nome, sem acento e sem caixa: quem digita "orcamento" tem de achar
    // "Orçamentos".
    const alvo = semAcento(q)
    return disponiveis.filter((d) => semAcento(t(d.navKey as "dashboard")).includes(alvo))
  }, [texto, disponiveis, t])

  function ir(d: Destino) {
    setTexto("")
    campo.current?.blur()
    router.push(d.rota)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setFoco(true)}
          // Atraso para o clique no resultado acontecer antes de a lista sumir.
          onBlur={() => setTimeout(() => setFoco(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && achados[0]) ir(achados[0])
            if (e.key === "Escape") {
              setTexto("")
              campo.current?.blur()
            }
          }}
          placeholder={tb("placeholder")}
          aria-label={tb("rotulo")}
          className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm"
        />
      </div>

      {foco && texto.trim() !== "" && (
        <ul
          role="listbox"
          className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {achados.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">{tb("semResultado")}</li>
          ) : (
            achados.map((d, i) => (
              <li key={d.codigo}>
                <button
                  type="button"
                  onClick={() => ir(d)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    i === 0 && "bg-muted/60"
                  )}
                >
                  <span className="min-w-[3rem] font-mono text-xs text-primary">{d.codigo}</span>
                  <span className="flex-1 truncate">{t(d.navKey as "dashboard")}</span>
                  {i === 0 && <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
