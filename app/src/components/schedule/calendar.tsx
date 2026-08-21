"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, GripVertical, Lock, X } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { reagendarOs } from "@/actions/schedule"
import { comDiaTrocado, conflitos, motivoParaNaoReagendar, type Agendado } from "@/lib/agenda"

const statusColor: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  INVOICED: "bg-purple-100 text-purple-800 border-purple-200",
}

type OrderEvent = {
  id: string
  number: number
  title: string
  status: string
  scheduledAt: Date | string | null
  client: { name: string }
  technician: { name: string } | null
}

type Props = {
  events: OrderEvent[]
  year: number
  month: number
  /** Permissão por ação (lib/acoes.ts). Sem ela, a alça de arrastar some — a
   *  Action recusa de qualquer jeito, e alça que aparece e falha é pior que
   *  alça que não aparece. */
  podeReagendar?: boolean
}

type Aviso = { tom: "erro" | "ok"; texto: string }

export function Calendar({ events, year, month, podeReagendar = true }: Props) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const router = useRouter()
  const searchParams = useSearchParams()
  const weekdays = t.raw("calendar.weekdays") as string[]
  const months = t.raw("calendar.months") as string[]

  /** OS que o usuário pegou para mover pelo toque. */
  const [movendo, setMovendo] = useState<string | null>(null)
  /** Datas já movidas nesta sessão de tela, para o card pular na hora em vez de
   *  esperar a volta do servidor. */
  const [otimista, setOtimista] = useState<Record<string, Date>>({})
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [salvando, iniciarSalvamento] = useTransition()

  const anterior = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const proximo = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }

  /** Troca ano e mês PRESERVANDO o resto da URL. Montar o endereço à mão
   *  descartaria o filtro de filial — e a pessoa que filtrou uma unidade
   *  voltaria a ver a empresa toda só por avançar um mês, sem perceber. */
  function mes(y: number, m: number): string {
    const p = new URLSearchParams(searchParams.toString())
    p.set("year", String(y))
    p.set("month", String(m))
    return `/schedule?${p.toString()}`
  }

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()

  /** Quando cada OS está agendada agora, contando o que foi movido na tela. */
  function quandoDe(ev: OrderEvent): Date | null {
    if (otimista[ev.id]) return otimista[ev.id]
    return ev.scheduledAt ? new Date(ev.scheduledAt) : null
  }

  // Agrupa por dia CONFERINDO ano e mês. Antes só o dia do mês era comparado,
  // e como os botões de mês mexiam apenas em estado local (sem refazer a busca)
  // avançar o mês redesenhava as MESMAS OS nos mesmos números de dia. Uma
  // agenda que mostra serviço no mês errado é pior que uma agenda vazia — e com
  // arrastar isso deixaria de ser só enganoso e passaria a mover a OS errada.
  const byDay: Record<number, OrderEvent[]> = {}
  for (const ev of events) {
    const d = quandoDe(ev)
    if (!d || d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    ;(byDay[d.getDate()] ??= []).push(ev)
  }
  for (const dia of Object.keys(byDay)) {
    byDay[Number(dia)].sort((a, b) => (quandoDe(a)!.getTime() - quandoDe(b)!.getTime()))
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function mover(orderId: string, dia: number) {
    setMovendo(null)
    const ev = events.find((e) => e.id === orderId)
    const origem = ev && quandoDe(ev)
    if (!ev || !origem) return
    if (origem.getDate() === dia && origem.getMonth() + 1 === month) return

    const destino = comDiaTrocado(origem, year, month, dia)

    // Move na tela primeiro. Se o servidor recusar, volta — mas o caso comum é
    // funcionar, e esperar a rede para o card pular faz a agenda parecer travada.
    setOtimista((o) => ({ ...o, [orderId]: destino }))
    setAviso(null)

    iniciarSalvamento(async () => {
      const r = await reagendarOs(orderId, year, month, dia)

      if (!r.ok) {
        setOtimista((o) => {
          const copia = { ...o }
          delete copia[orderId]
          return copia
        })
        setAviso({ tom: "erro", texto: t(`reagendar.motivo.${r.motivo}` as "reagendar.motivo.naoEncontrada") })
        return
      }

      setAviso({ tom: "ok", texto: avisoDeSucesso(ev, destino) })
      // Traz a verdade do servidor por cima do otimismo, e recalcula o resumo
      // lateral, que também mostra a data.
      router.refresh()
    })
  }

  /** A confirmação, com o aviso de conflito grudado quando houver. */
  function avisoDeSucesso(ev: OrderEvent, destino: Date): string {
    const agenda: Agendado[] = events.flatMap((e) => {
      const q = e.id === ev.id ? destino : quandoDe(e)
      return q ? [{ id: e.id, responsavel: e.technician?.name ?? null, quando: q }] : []
    })
    const choque = conflitos(agenda, {
      id: ev.id,
      responsavel: ev.technician?.name ?? null,
      quando: destino,
    })

    const movida = t("reagendar.movida", {
      number: String(ev.number),
      data: destino.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }),
      hora: destino.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    })
    if (choque.length === 0) return movida

    // Avisa, não impede: quem monta a agenda às vezes encaixa dois de propósito.
    return `${movida} ${t("reagendar.conflito", {
      nome: ev.technician?.name ?? "",
      count: choque.length,
    })}`
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho: navegar de mês agora é NAVEGAÇÃO de verdade (muda a URL e
          refaz a busca no servidor), e não só estado da tela. */}
      <div className="flex items-center justify-between">
        <Link
          href={mes(anterior.y, anterior.m)}
          className={buttonVariants({ variant: "ghost" })}
          aria-label={t("reagendar.mesAnterior")}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold text-base">{months[month - 1]} {year}</span>
        <Link
          href={mes(proximo.y, proximo.m)}
          className={buttonVariants({ variant: "ghost" })}
          aria-label={t("reagendar.mesSeguinte")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {movendo && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span>{t("reagendar.escolhaODia")}</span>
          <button
            type="button"
            onClick={() => setMovendo(null)}
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            <X className="size-3" /> {tc("cancel")}
          </button>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            aviso.tom === "erro"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-primary/30 bg-primary/5"
          )}
        >
          {aviso.texto}
        </div>
      )}

      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {weekdays.map(d => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className={cn("grid grid-cols-7 border-t border-l", salvando && "opacity-70")}>
        {cells.map((day, i) => {
          const isToday = day !== null &&
            today.getDate() === day &&
            today.getMonth() + 1 === month &&
            today.getFullYear() === year
          const dayEvents = day ? (byDay[day] ?? []) : []

          return (
            <div
              key={i}
              className="relative border-b border-r min-h-[80px] p-1 text-sm"
              onDragOver={day !== null ? (e) => e.preventDefault() : undefined}
              onDrop={day !== null ? (e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                if (id) mover(id, day)
              } : undefined}
            >
              {day !== null && (
                <>
                  <span className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday && "bg-primary text-primary-foreground"
                  )}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(ev => {
                      // Sem permissão, todo card fica travado — o motivo do
                      // status continua tendo prioridade na explicação.
                      const travada = podeReagendar
                        ? motivoParaNaoReagendar(ev.status)
                        : motivoParaNaoReagendar(ev.status) ?? "semPermissao"
                      return (
                        <div
                          key={ev.id}
                          className={cn(
                            "flex items-center rounded border text-xs leading-tight",
                            statusColor[ev.status] ?? "bg-gray-100 text-gray-800",
                            movendo === ev.id && "ring-2 ring-primary"
                          )}
                        >
                          {travada ? (
                            <span
                              className="shrink-0 px-0.5 opacity-40"
                              title={t(`reagendar.motivo.${travada}` as "reagendar.motivo.concluida")}
                            >
                              <Lock className="size-3" />
                            </span>
                          ) : (
                            // A alça é o que se pega. O card continua sendo um
                            // link: o toque que abre a OS é a ação principal e
                            // não pode virar refém do arrastar.
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", ev.id)
                                e.dataTransfer.effectAllowed = "move"
                              }}
                              onClick={() => setMovendo((m) => (m === ev.id ? null : ev.id))}
                              aria-label={t("reagendar.mover", { number: String(ev.number) })}
                              className="shrink-0 cursor-grab touch-none px-0.5 opacity-60 hover:opacity-100 active:cursor-grabbing"
                            >
                              <GripVertical className="size-3" />
                            </button>
                          )}
                          <Link
                            href={`/service-orders/${ev.id}`}
                            className="min-w-0 flex-1 truncate py-0.5 pr-1 hover:opacity-80 transition-opacity"
                            title={t("calendar.eventTooltip", {
                              // string: ICU formataria número puro com separador de milhar (1.234)
                              number: String(ev.number),
                              title: ev.title,
                              client: ev.client.name,
                            })}
                          >
                            #{ev.number} {ev.title}
                          </Link>
                        </div>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <span className="text-xs text-muted-foreground pl-1">
                        {t("calendar.moreEvents", { count: dayEvents.length - 2 })}
                      </span>
                    )}
                  </div>

                  {/* No celular não existe arrastar: o alvo é este botão, que
                      cobre o dia inteiro enquanto há uma OS na mão. Cobrir por
                      cima em vez de escutar clique na célula evita que o toque
                      caia num link de OS que esteja embaixo. */}
                  {movendo && podeReagendar && (
                    <button
                      type="button"
                      onClick={() => mover(movendo, day)}
                      aria-label={t("reagendar.soltarNoDia", { dia: String(day) })}
                      className="absolute inset-0 z-10 bg-primary/5 ring-1 ring-inset ring-primary/40 transition-colors hover:bg-primary/15"
                    />
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        {Object.entries(statusColor).map(([status, cls]) => (
          <span key={status} className={cn("rounded border px-2 py-0.5 text-xs", cls)}>
            {tc(`serviceOrderStatus.${status}` as "serviceOrderStatus.OPEN")}
          </span>
        ))}
      </div>
    </div>
  )
}
