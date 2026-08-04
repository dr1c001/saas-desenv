import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

// Servidor roda em UTC (padrão da Vercel), mas o negócio opera em horário de
// Brasília (UTC-3, sem horário de verão desde 2019) — "hoje"/"este mês"
// calculado com new Date() local no servidor fica ~3h adiantado em relação
// ao calendário real do usuário, o suficiente pra jogar um registro feito
// perto da virada do dia/mês pro período errado num relatório.
// (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
export function todayInBRT(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get("year"), month: get("month") - 1, day: get("day") }
}

// Meia-noite de um dia em horário de Brasília, como instante UTC real (não
// meia-noite UTC) — usado pra montar limites de intervalo que batem com o
// calendário do usuário. month é 0-indexed, igual Date nativo (aceita fora
// do intervalo 0-11: o Date normaliza automaticamente).
export function brtMidnightUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) + BRT_OFFSET_MS)
}

export function daysUntil(date: Date | string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
}

export function formatOsNumber(number: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear()
  return `OS${year}${String(number).padStart(4, "0")}`
}

export function formatOmNumber(number: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear()
  return `OM${year}${String(number).padStart(4, "0")}`
}
