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

/**
 * Normaliza um telefone brasileiro para o formato que o wa.me exige
 * (55 + DDD + número, só dígitos). Devolve null se não der pra confiar.
 *
 * Existe porque `replace(/\D/g, "")` sozinho é uma armadilha: quem configura
 * digita "(19) 99280-2772" naturalmente, isso vira "19992802772" e o link
 * aponta pra um número que não existe — sem erro em lugar nenhum, igual ao
 * número de exemplo que ficou anos na landing.
 */
export function normalizarWhatsappBR(bruto: string | undefined): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "")
  if (!digitos) return null

  // Já veio com o código do país: 55 + DDD (2) + número (8 ou 9).
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) return digitos

  // DDD + número, sem país — o caso comum de quem digita como fala.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`

  // Qualquer outro tamanho é erro de digitação. Melhor não mostrar o botão do
  // que mandar o visitante pra uma conversa com ninguém.
  return null
}

// Hosts oficiais de link do WhatsApp. A variável de ambiente é confiável, mas
// um erro de digitação no domínio mandaria todo visitante do site pra fora —
// e ninguém perceberia, porque o link continua abrindo alguma coisa.
const HOSTS_WHATSAPP = new Set(["wa.me", "api.whatsapp.com", "chat.whatsapp.com"])

/**
 * Monta o endereço do botão de suporte a partir do que estiver configurado.
 *
 * Aceita as duas formas que o WhatsApp usa hoje:
 *  - o número ("(19) 99280-2772"), e aí a mensagem inicial vem do nosso texto;
 *  - o link curto do WhatsApp Business ("https://wa.me/message/XXXX"), que já
 *    carrega a saudação configurada na conta — por isso não recebe `?text=`,
 *    que o formato de convite ignora.
 */
export function linkWhatsappSuporte(
  configurado: string | undefined,
  mensagem: string
): string | null {
  const valor = (configurado ?? "").trim()
  if (!valor) return null

  if (/^https?:\/\//i.test(valor)) {
    try {
      const url = new URL(valor)
      return HOSTS_WHATSAPP.has(url.hostname.toLowerCase()) ? url.toString() : null
    } catch {
      return null
    }
  }

  const numero = normalizarWhatsappBR(valor)
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : null
}
